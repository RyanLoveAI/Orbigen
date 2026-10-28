export async function installDesktopBridge() {
  if(window.webkit?.messageHandlers?.orbigenFolders)return;
  const response=await fetch('/api/desktop/capabilities');
  if(!response.ok)return;
  const capabilities=await response.json();
  if(!capabilities.folders)return;
  window.webkit??={};window.webkit.messageHandlers??={};
  window.webkit.messageHandlers.orbigenFolders={async postMessage(input){
    const r=await fetch('/api/desktop/folders',{method:'POST',headers:{'Content-Type':'application/json','X-Orbigen-Desktop':capabilities.token},body:JSON.stringify(input)});
    const value=await r.json();if(!r.ok)throw Error(value.error||'本地文件夹操作失败');return value.result;
  }};
}
