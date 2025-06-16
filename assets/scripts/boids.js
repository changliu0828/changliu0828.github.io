window.addEventListener('load', function() {
  console.log("sdfs" )
  // Get canvas element and 2D context
  const canvas = document.getElementById('demo-canvas');
  const ctx = canvas.getContext('2d');

  // Get container dimensions
  const container = canvas.parentElement;
  const containerWidth = container.clientWidth;
  const containerHeight = 400; // Fixed height

  // Set canvas dimensions to container width
  canvas.width = containerWidth;
  canvas.height = containerHeight;

  // Draw a simple circle to test the canvas
  ctx.fillStyle = '#ff6b6b';
  ctx.beginPath();
  ctx.arc(containerWidth / 2, containerHeight / 2, 50, 0, Math.PI * 2);
  ctx.fill();
  
  // Also draw a rectangle
  ctx.fillStyle = '#4ecdc4';
  ctx.fillRect(100, 100, 100, 50);
});
