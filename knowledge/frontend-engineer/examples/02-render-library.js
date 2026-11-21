// Render library cards from Blobs and revoke old object URLs on every re-render.
const live = new Set();
export function renderLibrary(list, scans) {
  live.forEach((u) => URL.revokeObjectURL(u)); live.clear();
  list.replaceChildren(...scans.map((s) => {
    const url = URL.createObjectURL(s.thumb || s.result); live.add(url);
    const li = document.createElement('li');
    li.innerHTML = `<img alt="" src="${url}"><span class="name"></span><time></time>`;
    li.querySelector('.name').textContent = s.name;                 // textContent: never inject names as HTML
    li.querySelector('time').textContent = new Date(s.createdAt).toLocaleString();
    return li;
  }));
}
