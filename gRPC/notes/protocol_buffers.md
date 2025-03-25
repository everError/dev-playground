# 📘 Protocol Buffers (`.proto`) 문법 정리

**Protocol Buffers (proto)**는 Google에서 만든 데이터 직렬화 형식으로, gRPC에서 서비스와 메시지를 정의할 때 사용됩니다.

---

## 📐 기본 구조

`.proto` 파일은 다음과 같은 기본 구성 요소로 이루어져 있습니다:

```proto
syntax = "proto3";

package your.package.name;

message YourMessage {
  string example_field = 1;
}

service YourService {
  rpc YourMethod (YourRequest) returns (YourResponse);
}
```

---

## ✅ 문법 요소별 설명

### 1. `syntax`

```proto
syntax = "proto3";
```

- 사용하고자 하는 proto 문법 버전을 명시합니다 (대부분 `proto3`).
- 파일 상단에 **반드시 1회**만 작성해야 합니다.

### 2. `package`

```proto
package example.v1;
```

- 생성되는 코드의 네임스페이스를 정의합니다.
- 동일한 proto 파일 내에서 충돌을 피하기 위해 사용합니다.

### 3. `import`

```proto
import "other.proto";
```

- 다른 `.proto` 파일의 메시지나 서비스를 사용할 때 포함합니다.

---

## 💬 메시지(message) 정의

```proto
message User {
  string name = 1;
  int32 age = 2;
  bool is_active = 3;
}
```

- 데이터 구조체를 정의합니다.
- 각 필드는 `타입 필드명 = 고유 번호;` 형식으로 선언합니다.
- 번호는 직렬화에 사용되므로 **절대 변경하거나 재사용하지 말아야 합니다**.

### 지원되는 기본 타입

- 정수형: `int32`, `int64`, `uint32`, `uint64`, `sint32`, `sint64`, `fixed32`, `fixed64`
- 부동소수점: `float`, `double`
- 논리형: `bool`
- 문자열: `string`
- 바이트: `bytes`
- 중첩된 message 타입도 선언 가능

---

## 🛠️ 서비스(service) 정의

```proto
service Greeter {
  rpc SayHello (HelloRequest) returns (HelloReply);
}
```

- gRPC에서 원격 호출 가능한 API 메서드를 정의합니다.
- 각 메서드는 요청 메시지와 응답 메시지를 지정합니다.

### RPC 통신 유형

| 유형                    | 설명                               |
| ----------------------- | ---------------------------------- |
| Unary                   | 요청 1건 → 응답 1건                |
| Server Streaming        | 요청 1건 → 응답 스트림             |
| Client Streaming        | 요청 스트림 → 응답 1건             |
| Bidirectional Streaming | 요청 스트림 ↔ 응답 스트림 (양방향) |

---

## 🔁 필드 제어 키워드

### `optional`

```proto
optional string nickname = 4;
```

- 값을 생략할 수 있는 선택적 필드 (proto3에서 제한적으로 지원됨)

### `repeated`

```proto
repeated string tags = 5;
```

- 배열처럼 여러 값을 가질 수 있는 필드

### `oneof`

```proto
oneof contact_info {
  string email = 6;
  string phone = 7;
}
```

- 여러 필드 중 하나만 선택적으로 설정 가능한 구조 (Union과 유사)

---

## 📦 예제 디렉토리 구조

```
proto/
├── hello.proto          # 서비스 및 메시지 정의 파일
├── hello.pb.go          # 메시지 구조에 대한 Go 코드
└── hello_grpc.pb.go     # gRPC 서비스에 대한 Go 인터페이스
```
