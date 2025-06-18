window.addEventListener('load', function() {
  // Get canvas element and 2D context
  const canvas = document.getElementById('demo-canvas');
  const ctx = canvas.getContext('2d');
  
  // Get canvas display dimensions
  const rect = canvas.getBoundingClientRect();
  const containerWidth = rect.width;
  const containerHeight = rect.height;

  // Set canvas internal dimensions to match display dimensions
  canvas.width = containerWidth;
  canvas.height = containerHeight;

  // Boids array
  let boids = [];

  // Animation state
  let isPlaying = false;
  let animationInterval = null;

  // Flocking parameters
  let perceptionValue = 0;
  let separationValue = 0;
  let cohesionValue = 0;
  let alignmentValue = 0;

  // Get input elements
  const boidsCountInput = document.getElementById('boids-count');
  const perceptionInput = document.getElementById('perception');
  const separationInput = document.getElementById('separation');
  const cohesionInput = document.getElementById('cohesion');
  const alignmentInput = document.getElementById('alignment');
  const highlightInput = document.getElementById('highlight');
  const playButton = document.querySelector('.play-button');
  
  // Get value display elements
  const numberDisplayed = document.getElementById('number-value');
  const perceptionDisplayed = document.getElementById('perception-value');
  const separationDisplayed = document.getElementById('separation-value');
  const cohesionDisplayed = document.getElementById('cohesion-value');
  const alignmentDisplayed = document.getElementById('alignment-value');

  // Color
  const highlightColor = 'rgba(255, 0, 0, 1)';
  const normalColor = 'rgba(170, 170, 170, 1)';

  // Max speed
  const maxSpeed = 2;
  const maxSeparationValue = parseInt(document.getElementById('separation').attributes['max'].value);
  const maxCohesionValue = parseInt(document.getElementById('cohesion').attributes['max'].value);
  const maxAlignmentValue = parseInt(document.getElementById('alignment').attributes['max'].value);
  const separationWeight = 1;
  const cohesionWeight = 0.04;
  const alignmentWeight = 0.1;

  function random(min, max) {
    return Math.random() * (max - min) + min;
  }

  // Function to create a boid at random position
  function createBoid() {
    return {
      x: random(0, containerWidth),
      y: random(0, containerHeight),
      vx: random(-maxSpeed, maxSpeed),
      vy: random(-maxSpeed, maxSpeed),
    };
  }

  // Function to initialize boids
  function initializeBoids(count) {
    boids = [];
    for (let i = 0; i < count; i++) {
      boids.push(createBoid());
    }
  }

  // Function to adjust boids count without regenerating positions
  function adjustBoidsCount(newCount) {
    const currentCount = boids.length;
    
    if (newCount > currentCount) {
      // Add new boids
      for (let i = currentCount; i < newCount; i++) {
        boids.push(createBoid());
      }
    } else if (newCount < currentCount) {
      // Remove excess boids
      boids.splice(newCount);
    }
    // If newCount === currentCount, do nothing
  }

  // Function to calculate separation force
  function separate(boid) {
    let steer = { x: 0, y: 0 };
    let count = 0;
    
    // Check against all other boids
    boids.forEach(other => {
      let distance = Math.sqrt((boid.x - other.x) ** 2 + (boid.y - other.y) ** 2);
      
      // If close enough and not the same boid
      if (distance > 0 && distance < perceptionValue) {
        // Calculate vector pointing away from neighbor
        let diff = {
          x: boid.x - other.x,
          y: boid.y - other.y
        };
        
        // Normalize by distance (closer = stronger force)
        diff.x /= distance;
        diff.y /= distance;

        steer.x += diff.x;
        steer.y += diff.y;
        count++;
      }
    });
    
    // Average the steering force
    if (count > 0) {
      steer.x /= count;
      steer.y /= count;
      
      // Scale the force
      steer.x *= separationWeight * separationValue / maxSeparationValue;
      steer.y *= separationWeight * separationValue / maxSeparationValue;
    }
    
    return steer;
  }

  // Function to calculate alignment force
  function align(boid) {
    let steer = { x: 0, y: 0 };
    let count = 0;
    
    // Check against all other boids
    boids.forEach(other => {
      let distance = Math.sqrt((boid.x - other.x) ** 2 + (boid.y - other.y) ** 2);
      
      // If close enough and not the same boid
      if (distance > 0 && distance < perceptionValue) {
        steer.x += other.vx;
        steer.y += other.vy;
        count++;
      }
    });
    
    // Average the velocities
    if (count > 0) {
      steer.x /= count;
      steer.y /= count;
      
      // Scale the force
      steer.x *= alignmentWeight * alignmentValue / maxAlignmentValue;
      steer.y *= alignmentWeight * alignmentValue / maxAlignmentValue;
    }
    
    return steer;
  }

  // Function to calculate cohesion force
  function cohesion(boid) {
    let steer = { x: 0, y: 0 };
    let count = 0;
    
    // Check against all other boids
    boids.forEach(other => {
      let distance = Math.sqrt((boid.x - other.x) ** 2 + (boid.y - other.y) ** 2);
      
      // If close enough and not the same boid
      if (distance > 0 && distance < perceptionValue) {
        steer.x += other.x;
        steer.y += other.y;
        count++;
      }
    });
    
    // Calculate center of mass and steer towards it
    if (count > 0) {
      // Average position (center of mass)
      steer.x /= count;
      steer.y /= count;
      
      // Steer towards center of mass
      steer.x = steer.x - boid.x;
      steer.y = steer.y - boid.y;
      
      // Scale the force
      steer.x *= cohesionWeight * cohesionValue / maxCohesionValue;
      steer.y *= cohesionWeight * cohesionValue / maxCohesionValue;
    }
    
    return steer;
  }

  function limitSpeed(boid) {
    let speed = Math.sqrt(boid.vx * boid.vx + boid.vy * boid.vy);
    if (speed > maxSpeed) {
      boid.vx = (boid.vx / speed) * maxSpeed;
      boid.vy = (boid.vy / speed) * maxSpeed;
    }
  }

  function keepWithinBounds(boid) {
    const margin = 20;
    const turnFactor = 0.5;
    
    if (boid.x < margin) {
      boid.vx += turnFactor;
    } else if (boid.x > containerWidth - margin) {
      boid.vx -= turnFactor;
    }
    
    if (boid.y < margin) {
      boid.vy += turnFactor;
    } else if (boid.y > containerHeight - margin) {
      boid.vy -= turnFactor;
    }
    
    // Ensure boids stay within bounds
    boid.x = Math.max(0, Math.min(containerWidth, boid.x));
    boid.y = Math.max(0, Math.min(containerHeight, boid.y));
  }

  // Function to update boid positions
  function updateBoidPositions() {
    boids.forEach((boid, index) => {
      // Apply separation if enabled
      const sep = separate(boid);
      boid.vx += sep.x;
      boid.vy += sep.y;
      
      // Apply alignment if enabled
      const ali = align(boid);
      boid.vx += ali.x;
      boid.vy += ali.y;
      
      // Apply cohesion if enabled
      const coh = cohesion(boid);
      boid.vx += coh.x;
      boid.vy += coh.y;
      
      // Keep within bounds with smooth turning
      keepWithinBounds(boid);

      // Limit speed
      limitSpeed(boid);
      
      // Update position
      boid.x += boid.vx;
      boid.y += boid.vy;
    });
  }

  function drawNormalBoid(boid) {
    ctx.fillStyle = normalColor;
    ctx.beginPath();
    ctx.arc(boid.x, boid.y, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawHighlightBoid(boid) {
    ctx.fillStyle = highlightColor;
    ctx.beginPath();
    ctx.arc(boid.x, boid.y, 2, 0, Math.PI * 2);
    ctx.fill();

    // Draw perception range
    ctx.fillStyle = 'rgba(255, 0, 0, 0.1)'; // Shallow red with 10% opacity
    ctx.beginPath();
    ctx.arc(boid.x, boid.y, perceptionValue, 0, Math.PI * 2);
    ctx.fill();
  }

  // Function to draw a single boid
  function drawBoid(boid, index) {
    // Draw perception range for first boid if highlight is checked
    if (index === 0 && highlightInput.checked) {
      drawHighlightBoid(boid);
    } else {
      drawNormalBoid(boid);
    }
  }

  // Function to clear canvas and draw boids
  function drawBoids() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw each boid
    boids.forEach((boid, index) => {
      drawBoid(boid, index);
    });
  }

  // Animation loop
  function animate() {
    if (isPlaying) {
      updateBoidPositions();
      drawBoids();
    }
  }

  // Function to update boids based on input
  function updateBoids() {
    const count = parseInt(boidsCountInput.value);
    if (count >= 1 && count <= 100) {
      adjustBoidsCount(count);
      drawBoids();
      numberDisplayed.textContent = count;
    }
  }

  // Play/Pause functionality
  function togglePlay() {
    isPlaying = !isPlaying;
    if (isPlaying) {
      playButton.textContent = 'Pause';
      animationInterval = setInterval(animate, 1000 / 60); // 60 FPS
    } else {
      playButton.textContent = 'Play';
      if (animationInterval) {
        clearInterval(animationInterval);
        animationInterval = null;
      }
    }
  }

  // Input event listeners
  boidsCountInput.addEventListener('input', function() {
    updateBoids();
  });

  perceptionInput.addEventListener('input', function() {
    perceptionValue = parseFloat(this.value);
    perceptionDisplayed.textContent = perceptionValue;
  });

  separationInput.addEventListener('input', function() {
    separationValue = parseFloat(this.value);
    separationDisplayed.textContent = separationValue;
  });

  cohesionInput.addEventListener('input', function() {
    cohesionValue = parseFloat(this.value);
    cohesionDisplayed.textContent = cohesionValue;
  });

  alignmentInput.addEventListener('input', function() {
    alignmentValue = parseFloat(this.value);
    alignmentDisplayed.textContent = alignmentValue;
  });

  // Highlight checkbox event listener
  highlightInput.addEventListener('change', function() {
    drawBoids();
  });

  // Play button event listener
  playButton.addEventListener('click', togglePlay);

  // Initialize with default number of boids
  initializeBoids(1);
  drawBoids();
});
