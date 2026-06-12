from rag_service.documents.chunking import split_text


def test_split_text_uses_fixed_window_and_overlap() -> None:
    text = "".join(str(index % 10) for index in range(1100))

    chunks = split_text(text, window_size=500, overlap=80)

    assert [chunk.chunk_index for chunk in chunks] == [0, 1, 2]
    assert [len(chunk.text) for chunk in chunks] == [500, 500, 260]
    assert chunks[1].text.startswith(chunks[0].text[-80:])
    assert chunks[2].text.startswith(chunks[1].text[-80:])


def test_split_text_prefers_markdown_heading_boundaries() -> None:
    text = (
        "# 第一章\n\n"
        + "研究背景。" * 30
        + "\n\n## 第二节\n\n"
        + "推免资格名单包含张三、李四、王五。" * 8
        + "\n\n## 第三节\n\n"
        + "后续安排。" * 20
    )

    chunks = split_text(text, window_size=180, overlap=20, strategy="structured")

    assert len(chunks) >= 3
    assert any(chunk.text.startswith("## 第二节") for chunk in chunks)
    assert all(not chunk.text.startswith("。") for chunk in chunks)


def test_split_text_rejects_invalid_overlap() -> None:
    try:
        split_text("hello", window_size=100, overlap=100)
    except ValueError as error:
        assert "overlap" in str(error)
    else:
        raise AssertionError("expected invalid overlap to raise")
