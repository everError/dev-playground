## draw.io 개념 정리

### 1. draw.io란?

**diagrams.net**(구 draw.io)은 오픈소스 다이어그램 도구예요. 웹 브라우저에서 바로 쓸 수 있고, 모든 다이어그램을 **XML 텍스트**로 저장해요.

### 2. 핵심 구조

draw.io는 내부적으로 **mxGraph** 라이브러리를 사용하고, 이런 XML 구조를 가져요:

```xml
<mxfile>
  <diagram name="페이지1">
    <mxGraphModel>
      <root>
        <mxCell id="0"/>                    <!-- 루트 -->
        <mxCell id="1" parent="0"/>         <!-- 기본 레이어 -->

        <!-- 도형 (vertex) -->
        <mxCell id="2" value="서버"
                style="rounded=1;fillColor=#dae8fc;"
                vertex="1" parent="1">
          <mxGeometry x="100" y="100" width="120" height="60"/>
        </mxCell>

        <!-- 연결선 (edge) -->
        <mxCell id="3" edge="1" source="2" target="4" parent="1"/>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

**구성 요소:**

- `mxCell` - 모든 요소의 기본 단위
- `vertex="1"` - 도형 (사각형, 원 등)
- `edge="1"` - 연결선
- `style` - CSS 비슷한 스타일 문자열
- `mxGeometry` - 위치(x, y)와 크기(width, height)

### 3. 스타일 문법

세미콜론으로 구분된 key=value 형태:

```
rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontSize=14;
```

**자주 쓰는 스타일:**
| 속성 | 설명 | 예시 |
|-----|------|-----|
| `fillColor` | 배경색 | `#dae8fc` |
| `strokeColor` | 테두리색 | `#6c8ebf` |
| `rounded` | 둥근 모서리 | `0` 또는 `1` |
| `shape` | 도형 종류 | `cylinder3`, `actor`, `ellipse` |
| `fontSize` | 글자 크기 | `14` |
| `fontStyle` | 글자 스타일 | `1`=bold, `2`=italic |

### 4. 사용 환경

| 환경       | 접근 방법                     |
| ---------- | ----------------------------- |
| 웹         | https://app.diagrams.net      |
| 데스크톱   | Windows/Mac/Linux 앱 다운로드 |
| VS Code    | Draw.io Integration 확장      |
| Confluence | 공식 플러그인                 |
| 임베딩     | iframe으로 웹앱에 삽입        |

### 5. 저장 포맷

- `.drawio` / `.xml` - 순수 XML
- `.drawio.svg` - SVG 안에 XML 임베딩 (이미지로 보이면서 편집도 가능)
- `.drawio.png` - PNG 안에 XML 임베딩
- 내보내기: PDF, PNG, SVG, HTML 등

### 6. 프로그래밍 연동

**임베드 모드 (iframe 통신):**

```javascript
// draw.io iframe에 XML 로드
iframe.contentWindow.postMessage(
  JSON.stringify({ action: "load", xml: xmlString }),
  "*"
);

// 현재 다이어그램 XML 가져오기
iframe.contentWindow.postMessage(
  JSON.stringify({ action: "export", format: "xml" }),
  "*"
);
```

**React 라이브러리:**

```bash
npm install react-drawio
```

```jsx
import DrawIoEmbed from "react-drawio";
<DrawIoEmbed xml={diagramXml} onSave={handleSave} />;
```

### 7. LLM + draw.io 조합이 잘 맞는 이유

| 특성          | 이점                      |
| ------------- | ------------------------- |
| 텍스트 기반   | LLM이 직접 생성 가능      |
| 명확한 스키마 | few-shot 예시로 학습 쉬움 |
| 좌표 시스템   | 배치를 숫자로 제어        |
| 풍부한 아이콘 | AWS/GCP/Azure 등 내장     |

### 8. 학습 자료

**공식:**

- 공식 사이트: https://www.diagrams.net
- GitHub (오픈소스): https://github.com/jgraph/drawio
- 공식 문서: https://www.drawio.com/doc

**XML 포맷 이해:**

- mxGraph 문서: https://jgraph.github.io/mxgraph/docs/manual.html
- 포맷 가이드: https://drawio-app.com/blog/xml-format/

**프로그래밍 연동:**

- 임베드 가이드: https://www.drawio.com/blog/embedding-walkthrough
- react-drawio: https://github.com/marcveens/react-drawio
- next-ai-draw-io (LLM 연동 예시): https://github.com/DayuanJiang/next-ai-draw-io

**관련 논문:**

- "GenAI-DrawIO-Creator" (OpenReview): https://openreview.net/pdf?id=mZEJWVDUtt

### 9. 비슷한 도구 비교

| 도구           | 포맷       | 특징                         |
| -------------- | ---------- | ---------------------------- |
| **draw.io**    | XML        | 범용, 세밀한 제어            |
| **Mermaid**    | 텍스트 DSL | 간단한 문법, 마크다운 친화적 |
| **Excalidraw** | JSON       | 손그림 스타일                |
| **PlantUML**   | 텍스트 DSL | UML 특화                     |

draw.io는 이 중에서 **가장 범용적이고 세밀한 제어**가 가능해서, LLM으로 복잡한 아키텍처 다이어그램 생성할 때 적합해요.
