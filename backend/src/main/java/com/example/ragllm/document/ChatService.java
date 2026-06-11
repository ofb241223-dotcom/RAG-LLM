package com.example.ragllm.document;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.OutputStream;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import com.example.ragllm.settings.SettingsService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

@Service
public class ChatService {
    private static final int GENERATED_TITLE_LENGTH = 28;

    private final DocumentRepository documentRepository;
    private final JdbcChatRepository chatRepository;
    private final RagServiceClient ragServiceClient;
    private final Clock clock;
    private final SettingsService settingsService;
    private final ObjectMapper objectMapper;

    public ChatService(
            DocumentRepository documentRepository,
            JdbcChatRepository chatRepository,
            RagServiceClient ragServiceClient,
            Clock clock,
            SettingsService settingsService,
            ObjectMapper objectMapper
    ) {
        this.documentRepository = documentRepository;
        this.chatRepository = chatRepository;
        this.ragServiceClient = ragServiceClient;
        this.clock = clock;
        this.settingsService = settingsService;
        this.objectMapper = objectMapper;
    }

    public List<ChatDocumentDto> listDocuments() {
        return documentRepository.findAll().stream()
                .filter(document -> document.status() == DocumentProcessingStatus.READY)
                .sorted((left, right) -> right.updatedAt().compareTo(left.updatedAt()))
                .map(document -> ChatDocumentDto.from(
                        document,
                        chatRepository.countSessionsByDocument(document.id()),
                        chatRepository.lastActiveAtByDocument(document.id())
                ))
                .toList();
    }

    public List<ChatSessionSummaryDto> listSessions(Long documentId) {
        requireDocument(documentId);
        return chatRepository.listSessions(documentId).stream()
                .map(this::toSummary)
                .toList();
    }

    @Transactional
    public ChatSessionDetailDto createSession(ChatCreateSessionRequest request) {
        if (request == null || request.documentId() == null) {
            throw ApiException.badRequest("documentId is required");
        }
        DocumentRecord document = requireReadyDocument(request.documentId());
        String title = StringUtils.hasText(request.title()) ? request.title().strip() : "新对话";
        ChatSessionRecord session = chatRepository.createSession(document.id(), title, clock.instant());
        return toDetail(session);
    }

    public ChatSessionDetailDto getSession(Long sessionId) {
        return toDetail(requireSession(sessionId));
    }

    @Transactional
    public ChatSessionDetailDto updateSession(Long sessionId, ChatUpdateSessionRequest request) {
        ChatSessionRecord session = requireSession(sessionId);
        String title = StringUtils.hasText(request == null ? null : request.title())
                ? request.title().strip()
                : session.title();
        chatRepository.updateSession(session.id(), title, session.status(), clock.instant());
        return toDetail(requireSession(session.id()));
    }

    @Transactional
    public void deleteSession(Long sessionId) {
        requireSession(sessionId);
        chatRepository.deleteSession(sessionId);
    }

    @Transactional
    public ChatSessionDetailDto ask(Long sessionId, ChatAskMessageRequest request) {
        ChatSessionRecord session = requireSession(sessionId);
        String question = request == null ? null : request.question();
        if (!StringUtils.hasText(question)) {
            throw ApiException.badRequest("question is required");
        }
        String normalizedQuestion = question.strip();
        int existingMessages = chatRepository.countMessages(session.id());
        Instant now = clock.instant();
        var runtimeConfig = settingsService.currentRuntimeConfig();
        int topK = request.topK() == null || request.topK() <= 0 ? runtimeConfig.topK() : request.topK();
        List<Long> documentIds = runtimeConfig.currentDocumentOnly() ? List.of(session.documentId()) : null;

        if (existingMessages == 0 && "新对话".equals(session.title())) {
            chatRepository.updateSession(session.id(), titleFromQuestion(normalizedQuestion), session.status(), now);
            session = requireSession(session.id());
        }

        chatRepository.createMessage(session.id(), ChatRole.USER, normalizedQuestion, ChatMessageStatus.SUCCESS, null, now);
        try {
            QaAnswer answer = ragServiceClient.ask(new QaAskRequest(normalizedQuestion, documentIds, topK), runtimeConfig);
            ChatMessageRecord assistant = chatRepository.createMessage(
                    session.id(),
                    ChatRole.ASSISTANT,
                    answer.answer(),
                    ChatMessageStatus.SUCCESS,
                    null,
                    clock.instant()
            );
            int markerIndex = 1;
            if (runtimeConfig.showCitations()) {
                for (QaSource source : answer.sources()) {
                    chatRepository.createCitation(assistant.id(), source, markerIndex);
                    markerIndex++;
                }
            }
            chatRepository.touchSession(session.id(), clock.instant());
            return toDetail(requireSession(session.id()));
        } catch (RagServiceException exception) {
            chatRepository.createMessage(
                    session.id(),
                    ChatRole.ASSISTANT,
                    "问答请求失败。",
                    ChatMessageStatus.ERROR,
                    exception.getMessage(),
                    clock.instant()
            );
            chatRepository.touchSession(session.id(), clock.instant());
            return toDetail(requireSession(session.id()));
        }
    }

    public StreamingResponseBody askStream(Long sessionId, ChatAskMessageRequest request) {
        return outputStream -> {
            ChatSessionDetailDto detail = ask(sessionId, request);
            ChatMessageDto assistant = latestAssistant(detail.messages());
            if (assistant != null && StringUtils.hasText(assistant.content())) {
                streamContent(outputStream, assistant.content());
            }
            writeStreamEvent(outputStream, new ChatStreamEvent("session", null, detail));
        };
    }

    private ChatMessageDto latestAssistant(List<ChatMessageDto> messages) {
        for (int index = messages.size() - 1; index >= 0; index--) {
            ChatMessageDto message = messages.get(index);
            if (message.role() == ChatRole.ASSISTANT) {
                return message;
            }
        }
        return null;
    }

    private void streamContent(OutputStream outputStream, String content) throws IOException {
        int offset = 0;
        while (offset < content.length()) {
            int codePoint = content.codePointAt(offset);
            String chunk = new String(Character.toChars(codePoint));
            writeStreamEvent(outputStream, new ChatStreamEvent("chunk", chunk, null));
            offset += Character.charCount(codePoint);
            try {
                Thread.sleep(8);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                return;
            }
        }
    }

    private void writeStreamEvent(OutputStream outputStream, ChatStreamEvent event) throws IOException {
        outputStream.write(objectMapper.writeValueAsBytes(event));
        outputStream.write('\n');
        outputStream.flush();
    }

    private ChatSessionSummaryDto toSummary(ChatSessionRecord session) {
        return new ChatSessionSummaryDto(
                session.id(),
                session.documentId(),
                session.title(),
                session.status(),
                chatRepository.countMessages(session.id()),
                session.createdAt(),
                session.updatedAt()
        );
    }

    private ChatSessionDetailDto toDetail(ChatSessionRecord session) {
        DocumentRecord document = requireDocument(session.documentId());
        List<ChatMessageDto> messages = chatRepository.listMessages(session.id()).stream()
                .map(this::toMessage)
                .toList();
        return new ChatSessionDetailDto(
                session.id(),
                DocumentDto.from(document),
                session.title(),
                session.status(),
                session.createdAt(),
                session.updatedAt(),
                messages
        );
    }

    private ChatMessageDto toMessage(ChatMessageRecord message) {
        List<ChatCitationDto> citations = chatRepository.listCitations(message.id()).stream()
                .map(citation -> new ChatCitationDto(
                        "%d:%d:%s".formatted(message.id(), citation.documentId(), citation.chunkId()),
                        citation.markerIndex(),
                        citation.documentId(),
                        citation.filename(),
                        citation.chunkId(),
                        citation.score(),
                        citation.text(),
                        citation.page()
                ))
                .toList();
        return new ChatMessageDto(
                message.id(),
                message.role(),
                message.content(),
                message.status(),
                message.createdAt(),
                citations,
                message.errorMessage()
        );
    }

    private DocumentRecord requireDocument(Long documentId) {
        return documentRepository.findById(documentId)
                .orElseThrow(() -> ApiException.notFound("Document not found: " + documentId));
    }

    private DocumentRecord requireReadyDocument(Long documentId) {
        DocumentRecord document = requireDocument(documentId);
        if (document.status() != DocumentProcessingStatus.READY) {
            throw ApiException.badRequest("Only READY documents can be used for chat");
        }
        return document;
    }

    private ChatSessionRecord requireSession(Long sessionId) {
        return chatRepository.findSession(sessionId)
                .orElseThrow(() -> ApiException.notFound("Chat session not found: " + sessionId));
    }

    private String titleFromQuestion(String question) {
        if (question.length() <= GENERATED_TITLE_LENGTH) {
            return question;
        }
        return question.substring(0, GENERATED_TITLE_LENGTH) + "...";
    }

    private record ChatStreamEvent(String type, String content, ChatSessionDetailDto session) {
    }
}
