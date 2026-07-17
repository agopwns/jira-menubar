# Jira Menubar 팀원 온보딩

macOS 메뉴바에서 내 Jira 티켓을 확인하고, 코멘트·할당·상태 변경까지 실행하는 SwiftBar 플러그인입니다. 처음 설치는 약 5분 정도 걸립니다.

## 1. 준비하기

필요한 것은 다음 네 가지입니다.

- macOS
- 접근 권한이 있는 Jira Cloud 계정
- [Homebrew](https://brew.sh/)
- Jira 프로젝트 키(예: `DEV`, `APP`)

SwiftBar와 Node.js 18 이상을 설치합니다.

```bash
brew install swiftbar node
open -a SwiftBar
```

SwiftBar를 처음 실행하면 플러그인 폴더를 지정하라는 화면이 나옵니다. 원하는 폴더를 하나 지정한 뒤 다음 단계로 진행하세요.

## 2. API 토큰 만들기

[Atlassian API 토큰 페이지](https://id.atlassian.com/manage-profile/security/api-tokens)에서 이 플러그인 전용 토큰을 만듭니다.

- 토큰 이름 예시: `jira-menubar`
- 현재 버전에서는 **Create API token**을 선택합니다.
- **Create API token with scopes**로 만든 scoped token은 현재 버전과 호환되지 않습니다.
- 토큰은 생성 직후 한 번만 표시되므로 설치가 끝날 때까지 안전하게 보관하세요.

## 3. 설치하고 계정 연결하기

Terminal에서 다음 명령을 실행합니다.

```bash
/bin/bash -o pipefail -c 'curl -fsSL https://raw.githubusercontent.com/agopwns/jira-menubar/main/install.sh | /bin/bash'
```

설치 중 다음 정보를 차례로 입력합니다.

1. Jira 주소: `https://회사명.atlassian.net`
2. Atlassian 로그인 이메일
3. 방금 만든 API 토큰(입력 내용은 화면에 표시되지 않음)
4. 프로젝트 키: 여러 개라면 `DEV,APP`처럼 쉼표로 구분
5. 보드 ID: 스프린트 통계를 사용하지 않으면 Enter로 건너뛰기

설치 프로그램이 Jira 계정과 각 프로젝트의 접근 권한을 확인하고 내 `accountId`를 자동으로 저장합니다. 검증에 실패하면 기존 플러그인과 설정을 변경하지 않습니다.

## 4. 설치 확인하기

SwiftBar에서 플러그인을 새로고침한 뒤 메뉴바를 확인합니다.

- `J`와 티켓 수가 보이면 설치 완료입니다.
- `J⚙`가 보이면 설정이 완료되지 않았습니다.
- `J!`가 보이면 위젯을 열어 Jira 오류 메시지를 확인하세요.

`J!`가 아닌 상태에서 위젯의 티켓 섹션들이 오류 없이 표시되고, 하단에 `조회 HH:MM · N분 주기 · v...`가 보이면 정상적으로 실행 중입니다. 기본값은 5분입니다.

## 팀 설정 맞추기

설정 파일은 `~/.config/jira-menubar/config.json`에 있습니다. 위젯의 **⚙️ 위젯 설정 → config 파일 열기**로도 열 수 있습니다.

| 설정 | 용도 |
| --- | --- |
| `projects` | 새 티켓과 스프린트를 조회할 프로젝트 키 |
| `pollIntervalMinutes` | Jira 자동 조회 주기. 위젯 설정에서 5·10·15·30·60분 중 선택 가능 |
| `sectionDisplay` | 표시할 티켓 영역과 펼침/하위 메뉴 접기 방식 |
| `statusBuckets` | 즉시 처리·진행 중·계획 중으로 분류할 실제 Jira 상태명 |
| `transitionTargets` | 빠른 상태 변경 메뉴에 표시할 대상 상태 |
| `boardId` | 활성 스프린트 통계에 사용할 보드 ID(선택) |
| `customSections` | 팀에서 추가로 보고 싶은 JQL 섹션(선택) |

`statusBuckets`의 값은 Jira 화면에 표시되는 상태명과 정확히 같아야 합니다. 일치하지 않는 티켓은 사라지지 않고 **기타 내 티켓**에 표시됩니다.

보드 ID는 Jira 보드 URL의 `/boards/<숫자>` 또는 `rapidView=<숫자>`에서 확인할 수 있습니다.

자동 조회를 줄이려면 **⚙️ 위젯 설정 → Jira 조회 주기**에서 원하는 값을 고르세요. 수동 **🔄 새로고침**은 설정한 주기와 관계없이 즉시 Jira를 조회합니다.

티켓이 많아 메뉴가 길다면 **⚙️ 위젯 설정 → 🗂 티켓 영역**에서 필요 없는 영역의 체크를 끄거나 **접어서 보기 — 하위 메뉴**를 선택하세요. 접기 모드에서는 루트 메뉴에 영역명과 건수만 남고, 티켓과 빠른 액션은 영역의 하위 메뉴에서 확인할 수 있습니다.

## 업데이트와 재설정

업데이트할 때 설치 명령을 다시 실행하면 완전한 기존 설정은 유지한 채 플러그인만 교체됩니다. 필수값이 빠진 설정은 온보딩을 다시 진행하고, JSON이 깨진 설정은 덮어쓰지 않고 오류를 표시합니다.

```bash
/bin/bash -o pipefail -c 'curl -fsSL https://raw.githubusercontent.com/agopwns/jira-menubar/main/install.sh | /bin/bash'
```

계정, 토큰, 프로젝트 또는 보드 설정을 다시 입력하려면 다음 명령을 사용합니다. 스타일과 사용자 정의 섹션은 유지됩니다.

```bash
/bin/bash -o pipefail -c 'curl -fsSL https://raw.githubusercontent.com/agopwns/jira-menubar/main/install.sh | /bin/bash -s -- --reconfigure'
```

Git 저장소를 클론한 개발자는 `./install.sh`를 실행하면 현재 체크아웃의 플러그인을 설치할 수 있습니다.

## 문제 해결

| 증상 | 확인할 내용 |
| --- | --- |
| `SwiftBar plugin directory not found` | SwiftBar를 먼저 실행하고 플러그인 폴더를 지정한 뒤 다시 설치 |
| `Node.js was not found` | `brew install node` 실행 후 다시 설치 |
| `HTTP 401` | 이메일, 토큰 만료·폐기 여부, unscoped token인지 확인 |
| `HTTP 403` | Jira 프로젝트 조회·할당·코멘트·상태 변경 권한 확인 |
| 새 티켓 섹션만 실패 | `projects`에 프로젝트 이름이 아닌 프로젝트 키를 입력했는지 확인 |
| 티켓이 모두 기타로 표시 | `statusBuckets`의 상태명이 Jira 상태명과 일치하는지 확인 |
| 스프린트가 표시되지 않음 | `boardId`와 Jira Software 보드 접근 권한 확인 |
| `bad interpreter` | Node 경로가 바뀌었으므로 설치 명령을 다시 실행 |
| 알림이 보이지 않음 | 시스템 설정 → 알림에서 Script Editor 알림 허용 |

문제가 계속되면 플러그인 메뉴의 오류 문구만 먼저 공유하세요. 설정 파일에는 토큰 외에도 이메일, 사이트 주소, 계정 ID, 프로젝트 키와 사용자 JQL이 있으므로 파일 전체를 Slack, Git 또는 이슈에 공유하지 마세요.

## 보안과 제거

- API 토큰은 Git 저장소가 아닌 `~/.config/jira-menubar/config.json`에 저장됩니다.
- 설정 파일은 소유자만 읽을 수 있도록 권한 `600`으로 관리됩니다.
- `~/.cache/jira-menubar`에는 티켓 키와 제목이 포함될 수 있으며, 디렉터리 `700`·파일 `600`으로 관리됩니다.
- 토큰은 macOS Keychain이 아닌 설정 파일에 평문으로 저장됩니다.
- 플러그인은 로그인한 사용자의 Jira 권한으로 티켓 조회, 할당, 코멘트, 상태 변경을 실행합니다.
- 더 이상 사용하지 않는 토큰은 [Atlassian API 토큰 페이지](https://id.atlassian.com/manage-profile/security/api-tokens)에서 폐기하세요.

제거하려면 SwiftBar 플러그인 폴더의 `jira-tickets.5m.js`를 삭제합니다. 개인 설정과 캐시까지 지우려면 `~/.config/jira-menubar`와 `~/.cache/jira-menubar`도 삭제하세요.
