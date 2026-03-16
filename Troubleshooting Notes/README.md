# Troubleshooting Notes

개발 과정에서 직접 겪은 트러블슈팅 사례를 기록합니다.

## Categories

| 분류             | 설명                                                                   |
| ---------------- | ---------------------------------------------------------------------- |
| **Backend**      | 백엔드 서비스, API, gRPC, 인증/인가 등 서버 사이드 이슈                |
| **Frontend**     | 프론트엔드 UI, 상태관리, 빌드, 브라우저 호환 등 클라이언트 사이드 이슈 |
| **AI/LLM**       | LLM 연동, 프롬프트 엔지니어링, AI 서비스 통합 관련 이슈                |
| **Build/Deploy** | CI/CD, 빌드 파이프라인, 배포 환경 구성 관련 이슈                       |
| **DB**           | 쿼리 성능, 마이그레이션, 데이터 정합성 관련 이슈                       |
| **Infra**        | 서버 구성, 컨테이너, OS, 모니터링 관련 이슈                            |
| **Network**      | 통신 프로토콜, 방화벽, DNS, 프록시 관련 이슈                           |

---

### Infra

- Docker Compose 서비스 의존 순서 문제로 API 서버 기동 실패 `Docker` `.NET` `PostgreSQL`
- Docker 이미지 빌드 시 캐시 무효화로 매번 전체 빌드 수행 `Docker` `.NET`
- Docker 컨테이너 간 통신 실패 (네트워크 및 DNS 해석 문제) `Docker`

### Backend

- EF Core DbContext Tracking 충돌로 인한 InvalidOperationException `.NET` `EF Core`
- EF Core 다중 경로 CASCADE 참조로 인한 마이그레이션 실패 `.NET` `EF Core`
- ORM N+1 쿼리 문제로 인한 조회 성능 저하 `.NET` `EF Core`
- OPC UA Int64/UInt64 값이 비정상적인 쉼표 구분 문자열로 저장됨 `Node.js` `OPC UA`

### Frontend

- Vue 3 반응성이 동작하지 않는 경우 (reactive/ref 사용 시 주의점) `Vue`
- 모듈 최상단에서 미초기화 의존성 참조로 인한 런타임 에러 `Vue` `TypeScript`

### AI/LLM

- RAG 청크 크기 및 오버랩 설정에 따른 검색 품질 저하 `LangChain` `ChromaDB`
- MCP 도구 호출 결과를 LLM이 잘못 해석하여 부정확한 응답 생성 `MCP` `LangChain`

### Build/Deploy

- 재배포 후 브라우저 캐시로 인한 구버전 리소스 로드 이슈 `Vite` `Caddy`
- git pull 시 로컬 변경사항과 원격 변경사항 충돌로 pull 실패 `Git` `GitLab`

### DB

- EF Core 대량 INSERT 시 극심한 속도 저하 (건별 INSERT 생성 문제) `.NET` `EF Core` `PostgreSQL` `SQL Server`
- SQL Server 교착 상태(Deadlock)로 인한 트랜잭션 강제 종료 `.NET` `EF Core` `SQL Server`

### Network

- Nginx 실행 시 localhost 충돌로 인한 Ocelot 게이트웨이 응답 지연 `Nginx` `.NET` `Ocelot`
- WebSocket 연결이 일정 시간 후 자동 끊김 (리버스 프록시 Idle Timeout) `Caddy` `.NET` `Vue`
