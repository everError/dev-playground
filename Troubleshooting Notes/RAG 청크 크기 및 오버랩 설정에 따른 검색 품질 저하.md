**Title:** RAG 청크 크기 및 오버랩 설정에 따른 검색 품질 저하

**Category:** Backend

**Stack:** LangChain, ChromaDB

**Status:** Resolved

**Priority:** High

---

## Environment

- RAG 파이프라인: LangChain
- Vector DB: Chroma (또는 Milvus 등)
- 임베딩 모델: OpenAI text-embedding, 또는 다국어 임베딩 모델
- 대상 문서: 사내 매뉴얼, 기술 문서, 규정집 등 다양한 길이의 한국어/영어 문서

## Symptom

동일한 질문인데 검색 결과가 기대와 전혀 다르게 나온다. 구체적으로 두 가지 양상으로 나타난다.

- 질문과 관련된 내용이 문서에 분명히 존재하는데, 검색 상위 결과에 포함되지 않아 LLM이 "관련 정보를 찾을 수 없다"고 답변한다
- 검색 결과에 관련 내용이 포함되어 있지만 맥락이 부족하거나, 무관한 내용이 섞여서 LLM이 부정확하거나 엉뚱한 답변을 생성한다

임베딩 모델이나 LLM을 바꿔도 근본적으로 개선되지 않고, 동일한 문서에 대해 질문 유형에 따라 품질 편차가 심하다.

## Cause

문서를 벡터로 변환하기 전에 수행하는 청킹(chunking) 단계에서 크기와 오버랩 설정이 문서 특성에 맞지 않기 때문이다. 청킹은 RAG 파이프라인의 가장 앞단에 위치하므로, 여기서 문제가 생기면 이후 임베딩, 검색, 생성 단계를 아무리 개선해도 품질이 올라가지 않는다.

**청크가 너무 작을 때 (예: 100~200자)**

하나의 문맥이 여러 청크로 쪼개진다. "A는 B이다. 그 이유는 C 때문이다."라는 내용이 두 청크로 분리되면, 검색 시 결론만 또는 이유만 반환되어 LLM이 불완전한 정보로 답변을 생성한다. 특히 한국어는 주어가 생략되는 경우가 많아, 앞 문장 없이는 "그 이유는 C 때문이다"만으로 무엇에 대한 이유인지 파악이 불가능하다.

**청크가 너무 클 때 (예: 3000자 이상)**

하나의 청크에 여러 주제가 섞인다. 임베딩 벡터는 청크 전체의 의미를 하나의 벡터로 압축하므로, 주제가 섞이면 어떤 질문에도 애매하게 유사한 벡터가 된다. 검색 상위에 올라오더라도 실제 답변에 필요한 부분은 청크의 일부에 불과하고 나머지는 노이즈로 작용하여 LLM이 혼란스러운 답변을 생성한다.

**오버랩이 없을 때 (overlap = 0)**

청크 경계에서 문맥이 완전히 단절된다. 핵심 정보가 두 청크의 경계에 걸쳐있으면 양쪽 모두에서 불완전한 상태로 존재하게 되어, 어느 쪽을 검색해도 정확한 답변을 얻지 못한다.

## Solution

**1. 문서 특성에 맞는 청크 크기를 설정한다**

절대적인 정답은 없지만, 출발점으로 삼을 수 있는 기준은 다음과 같다.

| 문서 유형          | 권장 청크 크기    | 오버랩    | 이유                              |
| ------------------ | ----------------- | --------- | --------------------------------- |
| 기술 문서 / 매뉴얼 | 500~1000자        | 100~200자 | 절차와 설명이 한 단위로 묶여야 함 |
| FAQ / Q&A          | 질문-답변 쌍 단위 | 불필요    | 구조가 명확하여 자연 경계가 존재  |
| 법률 / 규정        | 조항 단위         | 50~100자  | 조항 간 참조 관계 유지 필요       |
| 긴 보고서 / 논문   | 800~1500자        | 200~300자 | 논리 흐름이 길어 넉넉한 문맥 필요 |

**2. 단순 길이 분할 대신 구조 기반 분할을 사용한다**

```python
from langchain.text_splitter import RecursiveCharacterTextSplitter

# 기본: 재귀적 문자 분할 (가장 범용적)
splitter = RecursiveCharacterTextSplitter(
    chunk_size=800,
    chunk_overlap=200,
    separators=["\n\n", "\n", ". ", " ", ""]  # 큰 단위부터 시도
)
chunks = splitter.split_text(document)
```

`RecursiveCharacterTextSplitter`는 문단(`\n\n`) → 줄바꿈(`\n`) → 문장(`. `) 순서로 분할 지점을 찾는다. 단순 글자 수로 자르는 것보다 문맥 보존이 훨씬 좋다.

**3. 마크다운이나 HTML 문서는 헤더 기반으로 분할한다**

```python
from langchain.text_splitter import MarkdownHeaderTextSplitter

headers_to_split = [
    ("#", "h1"),
    ("##", "h2"),
    ("###", "h3"),
]

splitter = MarkdownHeaderTextSplitter(headers_to_split_on=headers_to_split)
chunks = splitter.split_text(markdown_text)
# 각 청크에 헤더 메타데이터가 자동 포함됨
```

문서의 구조를 활용하면 주제 단위로 자연스럽게 분할되어 의미적 일관성이 높아진다. 헤더 정보가 메타데이터로 보존되므로 검색 시 필터링에도 활용할 수 있다.

**4. 청크에 상위 문맥을 메타데이터로 추가한다**

```python
# 청크 생성 시 소속 섹션 정보를 메타데이터로 저장
for chunk in chunks:
    chunk.metadata["section"] = current_section_title
    chunk.metadata["source"] = file_name
    chunk.metadata["page"] = page_number
```

청크 본문만으로 문맥이 부족할 때, 메타데이터에 포함된 섹션명이나 문서명을 LLM 프롬프트에 함께 전달하면 답변 정확도가 올라간다.

**5. 설정 변경 후 반드시 검색 품질을 테스트한다**

```python
# 대표 질문 세트로 검색 결과를 평가
test_queries = [
    "장비 점검 주기는?",
    "불량 판정 기준은?",
    "교대 근무 시 인수인계 절차는?",
]

for query in test_queries:
    results = vectorstore.similarity_search(query, k=3)
    for r in results:
        print(f"[score] {r.metadata.get('score', 'N/A')}")
        print(f"[content] {r.page_content[:200]}")
        print("---")
```

청크 설정을 변경할 때마다 대표 질문으로 검색 결과를 확인하여, 기대하는 내용이 상위에 노출되는지 검증해야 한다. 감으로 조정하면 한쪽을 개선할 때 다른 쪽이 나빠지는 것을 놓치게 된다.

## Notes

- 청킹 전략은 한 번 정하고 끝이 아니라, 문서가 추가되거나 질문 패턴이 바뀔 때마다 재검토가 필요하다
- 오버랩을 늘리면 검색 품질은 올라가지만, 벡터 DB의 저장량과 인덱싱 시간이 비례하여 증가한다. 트레이드오프를 고려해야 한다
- 임베딩 모델의 최대 토큰 수도 청크 크기의 상한이 된다. 예를 들어 OpenAI text-embedding-3-small은 8191 토큰이 상한이지만, 실질적으로 512~1024 토큰 범위에서 임베딩 품질이 가장 좋다
- 청킹만으로 해결이 안 되면 하이브리드 검색(벡터 검색 + BM25 키워드 검색)이나 리랭킹(reranking) 단계를 추가하는 것도 방법이다
