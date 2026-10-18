const grid = document.getElementById("grid");
const lb = document.getElementById("lightbox");
const lbImg = document.getElementById("lb-img");
const lbCap = document.getElementById("lb-cap");
const statusEl = document.getElementById("status");
let photos = [], visible = [], current = 0, filter = "all";

// Calls the API; if the server says 401, ask for the upload password and retry.
async function authedFetch(url, opts = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const pw = sessionStorage.getItem("pw");
    const res = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), ...(pw ? { "x-password": pw } : {}) } });
    if (res.status !== 401) return res;
    const entered = prompt(attempt ? "Wrong password, try again:" : "Enter the upload password:");
    if (entered === null) return res;
    sessionStorage.setItem("pw", entered);
  }
  return fetch(url, opts);
}

async function load() {
  try {
    const r = await fetch("/api/photos");
    if (!r.ok) throw new Error();
    photos = await r.json();
  } catch {
    statusEl.textContent = "Can't reach the gallery server. If you're running locally, start the site with start.bat.";
    return;
  }
  render();
}

function render() {
  grid.innerHTML = "";
  statusEl.textContent = photos.length ? "" : "No photos yet – upload some above!";
  photos.forEach(p => {
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `<img loading="lazy" alt=""><span></span><button class="del" title="Delete">&times;</button>`;
    el.querySelector("img").src = p.src;
    el.querySelector("img").alt = p.caption;
    el.querySelector("span").textContent = p.caption;
    el.onclick = () => openLb(p);
    el.querySelector(".del").onclick = async e => {
      e.stopPropagation();
      if (!confirm("Delete this photo?")) return;
      const res = await authedFetch(`/api/delete?key=${encodeURIComponent(p.id)}`, { method: "POST" });
      if (!res.ok) { alert("Couldn't delete (wrong password?)."); return; }
      load();
    };
    p.el = el;
    grid.append(el);
  });
  applyFilter();
}

function applyFilter() {
  photos.forEach(p => p.el.classList.toggle("hide", filter !== "all" && p.country !== filter));
  visible = photos.filter(p => !p.el.classList.contains("hide"));
}

document.querySelectorAll(".filters button").forEach(btn => {
  btn.onclick = () => {
    document.querySelector(".filters .active").classList.remove("active");
    btn.classList.add("active");
    filter = btn.dataset.filter;
    applyFilter();
  };
});

// Shrink big photos (max 2000px, JPEG) so uploads are fast and fit hosting limits.
async function shrink(file) {
  if (file.type === "image/gif") return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.85));
    return blob || file;
  } catch { return file; }
}

// Upload
const fileInput = document.getElementById("file-input");
const drop = document.getElementById("dropzone");
const countrySel = document.getElementById("country");

async function upload(files) {
  const imgs = [...files].filter(f => f.type.startsWith("image/"));
  if (!imgs.length) return;
  let n = 0, failed = 0;
  for (const f of imgs) {
    statusEl.textContent = `Uploading ${++n} of ${imgs.length}…`;
    const body = await shrink(f);
    const name = body === f ? f.name : f.name.replace(/\.[^.]+$/, "") + ".jpg";
    try {
      const res = await authedFetch(`/api/upload?country=${countrySel.value}&name=${encodeURIComponent(name)}`,
        { method: "POST", body, headers: { "content-type": body.type || f.type } });
      if (!res.ok) failed++;
    } catch { failed++; }
  }
  await load();
  if (failed) statusEl.textContent = `${failed} photo(s) failed to upload (wrong password or file too large).`;
}

fileInput.onchange = () => { upload(fileInput.files); fileInput.value = ""; };
["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", e => upload(e.dataTransfer.files));

// Lightbox
function show() { const p = visible[current]; lbImg.src = p.src; lbImg.alt = lbCap.textContent = p.caption; }
function openLb(p) { current = visible.indexOf(p); show(); lb.hidden = false; }
function step(d) { current = (current + d + visible.length) % visible.length; show(); }
function close() { lb.hidden = true; }
lb.querySelector(".close").onclick = close;
lb.querySelector(".prev").onclick = () => step(-1);
lb.querySelector(".next").onclick = () => step(1);
lb.onclick = e => { if (e.target === lb) close(); };
document.addEventListener("keydown", e => {
  if (lb.hidden) return;
  if (e.key === "Escape") close();
  if (e.key === "ArrowLeft") step(-1);
  if (e.key === "ArrowRight") step(1);
});

load();
