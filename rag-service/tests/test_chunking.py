from rag_service.documents.chunking import split_text


def test_split_text_uses_fixed_window_and_overlap() -> None:
    text = "".join(str(index % 10) for index in range(1100))

    chunks = split_text(text, window_size=500, overlap=80)

    assert [chunk.chunk_index for chunk in chunks] == [0, 1, 2]
    assert [len(chunk.text) for chunk in chunks] == [500, 500, 260]
    assert chunks[1].text.startswith(chunks[0].text[-80:])
    assert chunks[2].text.startswith(chunks[1].text[-80:])


def test_split_text_rejects_invalid_overlap() -> None:
    try:
        split_text("hello", window_size=100, overlap=100)
    except ValueError as error:
        assert "overlap" in str(error)
    else:
        raise AssertionError("expected invalid overlap to raise")
