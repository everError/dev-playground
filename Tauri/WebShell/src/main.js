// 로더 — 저장된 서버 URL 확인 후 이동. 미설정/접속불가면 안내 + 설정 창 유도.
const invoke = window.__TAURI__.core.invoke;

invoke('report_app_origin'); // 설정 저장 후 메인 창 복귀에 쓸 앱 origin 등록

const spinner = document.getElementById('spinner');
const status = document.getElementById('status');
const actions = document.getElementById('actions');

function showBlocked(message) {
  spinner.hidden = true;
  actions.hidden = false;
  status.textContent = message;
}

async function probe(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    await fetch(url, { mode: 'no-cors', cache: 'no-store', signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function start() {
  spinner.hidden = false;
  actions.hidden = true;
  status.textContent = '서버 연결 확인 중…';

  const config = await invoke('get_config');
  const url = (config.serverUrl || '').trim();

  if (!url) {
    showBlocked('접속할 서버 주소를 설정해 주세요.');
    invoke('open_settings');
    return;
  }
  if (await probe(url)) {
    location.replace(url);
  } else {
    showBlocked('서버에 연결할 수 없습니다. 네트워크 또는 서버 주소를 확인해 주세요.');
  }
}

document.getElementById('retry').addEventListener('click', start);
document.getElementById('openSettings').addEventListener('click', () => invoke('open_settings'));

start();
