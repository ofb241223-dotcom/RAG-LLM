package com.example.ragllm.document;

import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

@RestController
@RequestMapping("/api/chat")
public class ChatController {
    private final ChatService chatService;

    public ChatController(ChatService chatService) {
        this.chatService = chatService;
    }

    @GetMapping("/documents")
    public List<ChatDocumentDto> documents() {
        return chatService.listDocuments();
    }

    @GetMapping("/sessions")
    public List<ChatSessionSummaryDto> sessions(@RequestParam Long documentId) {
        return chatService.listSessions(documentId);
    }

    @PostMapping("/sessions")
    @ResponseStatus(HttpStatus.CREATED)
    public ChatSessionDetailDto createSession(@RequestBody(required = false) ChatCreateSessionRequest request) {
        return chatService.createSession(request);
    }

    @GetMapping("/sessions/{sessionId}")
    public ChatSessionDetailDto getSession(@PathVariable Long sessionId) {
        return chatService.getSession(sessionId);
    }

    @PatchMapping("/sessions/{sessionId}")
    public ChatSessionDetailDto updateSession(@PathVariable Long sessionId, @RequestBody(required = false) ChatUpdateSessionRequest request) {
        return chatService.updateSession(sessionId, request);
    }

    @PostMapping("/sessions/{sessionId}/messages")
    public ChatSessionDetailDto ask(@PathVariable Long sessionId, @RequestBody(required = false) ChatAskMessageRequest request) {
        return chatService.ask(sessionId, request);
    }

    @PostMapping(value = "/sessions/{sessionId}/messages/stream", produces = MediaType.APPLICATION_NDJSON_VALUE)
    public ResponseEntity<StreamingResponseBody> askStream(@PathVariable Long sessionId, @RequestBody(required = false) ChatAskMessageRequest request) {
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_NDJSON)
                .body(chatService.askStream(sessionId, request));
    }

    @DeleteMapping("/sessions/{sessionId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteSession(@PathVariable Long sessionId) {
        chatService.deleteSession(sessionId);
    }
}
