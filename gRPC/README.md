# gRPC란 무엇인가?

`gRPC`는 Google에서 개발한 **고성능, 오픈소스 RPC(Remote Procedure Call) 프레임워크**입니다.  
일반적인 REST API보다 빠르고 구조화된 통신을 가능하게 하며, **Protocol Buffers (protobuf)**를 사용해 데이터를 직렬화합니다.

---

## 💡 gRPC의 주요 특징

### 1. 🚀 고성능 바이너리 프로토콜

- JSON이 아닌 **Protocol Buffers (protobuf)**를 사용해 메시지를 바이너리로 직렬화
- 네트워크 사용량이 적고, 파싱 속도가 빠름

### 2. 🧩 서비스 인터페이스 정의

- `.proto` 파일로 서비스 메서드와 메시지 타입 정의
- 클라이언트와 서버는 같은 `.proto` 파일을 기반으로 코드 생성

### 3. 🌐 양방향 스트리밍 지원

- 단방향 요청/응답뿐 아니라,
  - 서버 스트리밍
  - 클라이언트 스트리밍
  - 양방향 스트리밍을 지원

### 4. 🏗️ 다양한 언어 지원

- Go, Python, Java, C#, Node.js, C++, Ruby 등 다중 언어 지원
- 서로 다른 언어 간 마이크로서비스 통신 가능

### 5. 🧱 마이크로서비스에 적합

- 서비스 간 효율적인 통신이 가능해 **마이크로서비스 아키텍처(MSA)**에서 많이 사용됨

---

## 🛠️ gRPC 동작 방식

1. **.proto 파일 작성**

   - 서비스 정의와 메시지 구조를 작성

2. **코드 생성**

   - `protoc` 컴파일러를 통해 서버/클라이언트 코드 자동 생성

3. **서버 구현**

   - 생성된 인터페이스를 기반으로 서버 구현

4. **클라이언트 호출**
   - gRPC 클라이언트가 서버 메서드를 원격 호출 (RPC)

## Client ──> gRPC Stub ──> Network ──> gRPC Server ──> Business Logic

## ⚙️ REST vs gRPC

| 항목            | REST                   | gRPC                              |
| --------------- | ---------------------- | --------------------------------- |
| 전송 포맷       | JSON (텍스트 기반)     | Protocol Buffers (바이너리)       |
| 인터페이스 정의 | 없음 (Swagger 등 사용) | `.proto` 명세로 자동화            |
| 속도            | 느림                   | 빠름                              |
| 스트리밍        | 지원 안 함             | 양방향 스트리밍 지원              |
| 브라우저 호환   | 매우 좋음              | HTTP/2 필요 (브라우저에선 제한적) |
