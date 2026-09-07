const PhotoCrop = {
  img: null,
  naturalW: 0,
  naturalH: 0,
  baseScale: 1,
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  viewportSize: 260,
  outputSize: 480,
  dragging: false,
  dragStart: null,
  offsetStart: null,
};

function openPhotoCropFromFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      PhotoCrop.img = img;
      PhotoCrop.naturalW = img.naturalWidth || img.width;
      PhotoCrop.naturalH = img.naturalHeight || img.height;
      PhotoCrop.baseScale = PhotoCrop.viewportSize / Math.min(PhotoCrop.naturalW, PhotoCrop.naturalH);
      PhotoCrop.zoom = 1;
      PhotoCrop.offsetX = (PhotoCrop.viewportSize - PhotoCrop.naturalW * PhotoCrop.baseScale) / 2;
      PhotoCrop.offsetY = (PhotoCrop.viewportSize - PhotoCrop.naturalH * PhotoCrop.baseScale) / 2;
      document.getElementById("crop-img").src = reader.result;
      document.getElementById("crop-zoom").value = "1";
      clampOffset();
      renderCrop();
      showScreen("screen-photo-crop");
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function currentScale() {
  return PhotoCrop.baseScale * PhotoCrop.zoom;
}

function clampOffset() {
  const scale = currentScale();
  const dispW = PhotoCrop.naturalW * scale;
  const dispH = PhotoCrop.naturalH * scale;
  const minX = Math.min(0, PhotoCrop.viewportSize - dispW);
  const minY = Math.min(0, PhotoCrop.viewportSize - dispH);
  PhotoCrop.offsetX = Math.max(minX, Math.min(0, PhotoCrop.offsetX));
  PhotoCrop.offsetY = Math.max(minY, Math.min(0, PhotoCrop.offsetY));
}

function renderCrop() {
  const scale = currentScale();
  const img = document.getElementById("crop-img");
  img.style.width = `${PhotoCrop.naturalW * scale}px`;
  img.style.height = `${PhotoCrop.naturalH * scale}px`;
  img.style.transform = `translate(${PhotoCrop.offsetX}px, ${PhotoCrop.offsetY}px)`;
}

function wirePhotoCropEvents() {
  const viewport = document.getElementById("crop-viewport");
  const zoomSlider = document.getElementById("crop-zoom");

  const start = (x, y) => {
    PhotoCrop.dragging = true;
    PhotoCrop.dragStart = { x, y };
    PhotoCrop.offsetStart = { x: PhotoCrop.offsetX, y: PhotoCrop.offsetY };
  };
  const move = (x, y) => {
    if (!PhotoCrop.dragging) return;
    PhotoCrop.offsetX = PhotoCrop.offsetStart.x + (x - PhotoCrop.dragStart.x);
    PhotoCrop.offsetY = PhotoCrop.offsetStart.y + (y - PhotoCrop.dragStart.y);
    clampOffset();
    renderCrop();
  };
  const end = () => { PhotoCrop.dragging = false; };

  viewport.addEventListener("pointerdown", (e) => { viewport.setPointerCapture(e.pointerId); start(e.clientX, e.clientY); });
  viewport.addEventListener("pointermove", (e) => move(e.clientX, e.clientY));
  viewport.addEventListener("pointerup", end);
  viewport.addEventListener("pointercancel", end);

  zoomSlider.addEventListener("input", (e) => {
    PhotoCrop.zoom = Number(e.target.value);
    clampOffset();
    renderCrop();
  });
}

function closeScreen(id) {
  document.getElementById(id).classList.remove("open");
}

function savePhotoCrop() {
  const canvas = document.createElement("canvas");
  canvas.width = PhotoCrop.outputSize;
  canvas.height = PhotoCrop.outputSize;
  const ctx = canvas.getContext("2d");
  const scale = currentScale();
  const sx = -PhotoCrop.offsetX / scale;
  const sy = -PhotoCrop.offsetY / scale;
  const sSize = PhotoCrop.viewportSize / scale;
  ctx.drawImage(PhotoCrop.img, sx, sy, sSize, sSize, 0, 0, PhotoCrop.outputSize, PhotoCrop.outputSize);
  formPhotoDataUrl = canvas.toDataURL("image/jpeg", 0.88);
  updatePhotoPreview();
  closeScreen("screen-photo-crop"); // return to the contact form beneath, not exit it
}
