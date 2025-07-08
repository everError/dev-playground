### 📌 Shebang (`#!`)

**Shebang**은 유닉스 계열 운영체제에서 **스크립트 파일의 첫 줄에 작성되는 특별한 문자 시퀀스**로, 해당 파일을 어떤 인터프리터로 실행할지 지정하는 역할을 합니다.

#### ✅ 문법:

```bash
#!/usr/bin/env python3
```

또는

```bash
#!/bin/bash
```

#### ✅ 의미:

- `#!` 뒤에 오는 경로는 **스크립트를 실행할 인터프리터의 절대 경로**입니다.
- 예: `#!/bin/bash` → 이 스크립트는 Bash 셸로 실행됨
- `#!/usr/bin/env python3` → PATH에 등록된 `python3`를 찾아 실행 (더 유연함)

#### ✅ 특징:

- 스크립트를 **직접 실행 가능하게 만듦** (예: `./script.sh`)
- 없는 경우, 실행 시 명시적으로 인터프리터를 지정해야 함 (`bash script.sh`)

---

### 📌 Idempotency (멱등성)

\*\*Idempotency(멱등성)\*\*은 **같은 요청을 여러 번 수행해도 결과가 변하지 않는 성질**을 의미합니다. RESTful API, 백엔드 시스템 설계, 결제 시스템 등에 매우 중요합니다.

#### ✅ 예시:

- `GET /users/1` → 유저 정보 조회 (몇 번 호출해도 같은 결과)
- `DELETE /users/1` → 이미 삭제된 유저에 대해 반복 호출해도 오류 없이 처리 가능해야 함
- `POST`는 기본적으로 멱등하지 않지만, 설계에 따라 멱등하게 만들 수 있음 (예: 클라이언트에서 idempotency key를 사용)

#### ✅ 왜 중요한가?

- **네트워크 재전송**으로 인한 중복 요청 처리
- **결제**, **회원가입**, **데이터 생성** 등에 대해 **중복 방지** 가능
- 안정적이고 예측 가능한 API 설계 가능

#### ✅ 적용 예시:

```http
POST /charge
Idempotency-Key: abc123
```

백엔드는 `abc123` 키로 이미 처리된 요청이 있다면, 동일한 응답을 반환하고 중복 처리를 방지함.

---

### 📌 Environment Variables (환경 변수)

\*\*환경 변수(Environment Variables)\*\*는 애플리케이션이 실행될 때 **외부에서 전달되는 설정 값**으로, 운영 환경에 따라 달라질 수 있는 정보를 관리합니다.

#### ✅ 사용 목적:

- 민감한 정보 숨기기 (예: DB 비밀번호, API 키)
- 환경별 설정 분리 (`dev`, `staging`, `prod` 등)
- Docker, CI/CD, 클라우드 배포 시 필수 요소

#### ✅ 예시:

```env
# .env 파일
DATABASE_URL=postgres://user:pass@localhost:5432/mydb
API_KEY=sk-xxx
```

Node.js에서 사용:

```js
const apiKey = process.env.API_KEY;
```

.NET에서 사용:

```csharp
var connStr = Environment.GetEnvironmentVariable("DATABASE_URL");
```

#### ✅ 관리 방법:

- `.env` 파일에 정의하고 `.gitignore`로 제외
- CI/CD에서는 플랫폼 설정 UI 또는 비밀 관리 서비스 사용 (ex: GitHub Actions Secrets, AWS SSM, Azure Key Vault)

---
