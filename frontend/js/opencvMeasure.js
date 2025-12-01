console.log("opencvMeasure.js loaded");

let imgElement = document.getElementById("inputImage");
let canvas = document.getElementById("measureCanvas");
let ctx = canvas.getContext("2d");
let clickPoints = [];

function loadImageFile(event) {
  imgElement.src = URL.createObjectURL(event.target.files[0]);
}

imgElement.onload = () => {
  canvas.width = imgElement.width;
  canvas.height = imgElement.height;
  ctx.drawImage(imgElement, 0, 0);
  clickPoints = [];
};

canvas.addEventListener("click", (event) => {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  clickPoints.push({ x, y });

  ctx.fillStyle = "red";
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fill();

  if (clickPoints.length === 2) measureDistance();
});

function measureDistance() {
  const p1 = clickPoints[0];
  const p2 = clickPoints[1];

  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;

  const pixels = Math.sqrt(dx * dx + dy * dy);

  alert("Pixel distance: " + pixels.toFixed(2));

  clickPoints = [];
}

window.loadImageFile = loadImageFile;
