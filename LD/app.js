// ===== Config =====
const API_URL = "http://localhost:5000/api/identify"; // update if deployed


// ===== Helpers =====
const $ = (q, ctx=document) => ctx.querySelector(q);
const $$ = (q, ctx=document) => Array.from(ctx.querySelectorAll(q));
const el = (tag, cls) => { const x = document.createElement(tag); if(cls) x.className = cls; return x; };

const toasts = (() => {
  let container = document.createElement("div");
  container.id = "toasts";
  container.className = "toasts";
  document.body.appendChild(container);
  return container;
})();

function toast(msg, type="ok", timeout=3200){
  const t = el("div", `toast ${type}`);
  t.textContent = msg;
  toasts.appendChild(t);
  setTimeout(()=>{ t.style.opacity=0; setTimeout(()=>t.remove(), 300); }, timeout);
}

// Tilt small effect
function enableTilt(){
  const tiltElems = document.querySelectorAll("[data-tilt]");
  tiltElems.forEach(card=>{
    if(card._tiltAttached) return;
    card._tiltAttached = true;
    card.addEventListener("mousemove", (e)=>{
      const rect = card.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      const tiltX = (y - 0.5) * -6;
      const tiltY = (x - 0.5) *  6;
      card.style.transform = `perspective(900px) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;
    });
    card.addEventListener("mouseleave", ()=> card.style.transform = "");
  });
}
enableTilt();

// Theme toggle
$("#themeToggle").addEventListener("click", ()=> document.body.classList.toggle("light"));

// ===== File handling & drag/drop =====
const fileInput = $("#fileInput");
const dropzone = $("#dropzone");
const dzClick = $("#dzClick");
const results = $("#results");

dzClick.addEventListener("click", ()=> fileInput.click());

["dragenter","dragover"].forEach(evt=> dropzone.addEventListener(evt, (e)=>{
  e.preventDefault(); e.stopPropagation(); dropzone.classList.add("dragover");
}));
["dragleave","drop"].forEach(evt=> dropzone.addEventListener(evt, (e)=>{
  e.preventDefault(); e.stopPropagation(); dropzone.classList.remove("dragover");
}));
dropzone.addEventListener("drop", (e)=>{
  const files = [...e.dataTransfer.files].filter(f=> /^image\//.test(f.type));
  if(!files.length){ toast("No images detected.", "err"); return; }
  handleFiles(files);
});
fileInput.addEventListener("change", ()=> {
  if(!fileInput.files?.length) return;
  handleFiles([...fileInput.files]);
});

// ===== Camera functionality =====
const openCameraBtn = $("#openCamera");
const cameraCard = $("#cameraCard");
const video = $("#cameraVideo");
const canvas = $("#cameraCanvas");
const captureBtn = $("#captureBtn");
const closeCameraBtn = $("#closeCamera");

let cameraStream = null;

async function openCamera(){
  try{
    // prefer environment (back) camera on mobile if available
    const constraints = { video: { facingMode: { ideal: "environment" } } , audio: false };
    cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = cameraStream;
    video.classList.remove("hidden");
    cameraCard.classList.remove("hidden");
    enableTilt();
  }catch(err){
    console.error("Camera error:", err);
    toast("Could not access camera. Check permissions or try a different browser.", "err");
  }
}

function stopCamera(){
  if(!cameraStream) return;
  cameraStream.getTracks().forEach(t => t.stop());
  cameraStream = null;
  video.srcObject = null;
  cameraCard.classList.add("hidden");
}

openCameraBtn.addEventListener("click", openCamera);
closeCameraBtn.addEventListener("click", stopCamera);

captureBtn.addEventListener("click", async ()=>{
  if(!cameraStream){
    toast("Camera not active.", "err");
    return;
  }
  // capture current frame
  const w = video.videoWidth;
  const h = video.videoHeight;
  if(!w || !h){
    toast("Could not capture frame — try again.", "err");
    return;
  }
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, w, h);

  // Convert to blob and create a File
  canvas.toBlob(async (blob) => {
    if(!blob){ toast("Capture failed.", "err"); return; }
    const file = new File([blob], `camera_${Date.now()}.jpg`, { type: "image/jpeg" });
    // render skeleton card and send
    handleFiles([file]);
    // optionally stop camera after capture but keep open for convenience
    // stopCamera();
  }, "image/jpeg", 0.92);
});

// ===== Core: send to backend and render =====
async function handleFiles(files){
  // Pre-render cards with thumbnails
  const indices = [];
  for(const [i, file] of files.entries()){
    const idx = Date.now() + i + Math.floor(Math.random()*1000);
    indices.push({idx, file});
    renderCardSkeleton(idx, file);
  }

  try{
    const form = new FormData();
    files.forEach(f => form.append("images", f, f.name));

    const res = await fetch(API_URL, { method:"POST", body: form });
    if(!res.ok){
      const txt = await res.text();
      throw new Error(`Server error ${res.status}: ${txt}`);
    }
    const data = await res.json();
    if(!data.results) throw new Error("Malformed server response.");

    data.results.forEach((r, i)=>{
      const id = indices[i].idx;
      fillCardResult(id, r);
    });

    toast(`Analyzed ${data.results.length} image(s).`, "ok");
  }catch(err){
    console.error(err);
    toast(err.message || "Request failed.", "err");
  }
}

// ===== UI builders =====
function renderCardSkeleton(id, file){
  const reader = new FileReader();
  reader.onload = (e)=>{
    const url = e.target.result;

    const card = el("div", "card result tilt");
    card.dataset.tilt = "1";
    card.id = `card-${id}`;

    const thumb = el("div", "thumb");
    const img = el("img");
    img.src = url;
    thumb.appendChild(img);

    const badge = el("div", "badge");
    badge.textContent = (file.name || "image").slice(0, 22);
    thumb.appendChild(badge);

    const meta = el("div", "meta");
    const title = el("h3"); title.textContent = "Detecting…";
    const desc = el("p"); desc.textContent = "Waiting for model response...";
    meta.append(title, desc);

    const actions = el("div", "actions");
    const tag = el("div", "tag"); tag.textContent = Math.round((file.size/1024)) + " KB";
    actions.append(tag);

    card.append(thumb, meta, actions);
    results.prepend(card);
    enableTilt();
  };
  reader.readAsDataURL(file);
}

function fillCardResult(id, result){
  const card = document.getElementById(`card-${id}`);
  if(!card) return;

  const title = card.querySelector(".meta h3");
  const desc = card.querySelector(".meta p");

  if(result.error){
    card.classList.add("err");
    title.textContent = "Error";
    desc.textContent = result.error;
    return;
  }

  card.classList.add("ok");
  title.textContent = result.name || "Unknown";
  desc.textContent = result.description || "—";
}
