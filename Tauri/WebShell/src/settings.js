// 설정 창 — 서버 URL 편집/저장. 별도 창이라 메인 상태를 건드리지 않는다.
const invoke = window.__TAURI__.core.invoke;

invoke('report_app_origin');

const DEFAULT_URL = 'http://localhost:9060';
const input = document.getElementById('serverUrl');
let savedUrl = '';

(async () => {
  const config = await invoke('get_config');
  savedUrl = (config.serverUrl || '').trim();
  input.value = savedUrl || DEFAULT_URL;
  input.focus();
})();

document.getElementById('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = input.value.trim();
  await invoke('save_config', { config: { serverUrl: url } });
  if (url !== savedUrl) {
    await invoke('reload_main'); // URL 이 바뀐 경우에만 메인 창 이동 (아니면 상태 보존)
  }
  await invoke('close_settings');
});

document.getElementById('reset').addEventListener('click', async () => {
  await invoke('reset_config');
  savedUrl = '';
  input.value = DEFAULT_URL;
  await invoke('reload_main'); // 메인을 "서버 주소를 설정해 주세요" 안내 화면으로
  input.focus();
});

document.getElementById('exit').addEventListener('click', () => invoke('exit_app'));
