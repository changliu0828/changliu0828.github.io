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
  let separationRadius = 0;
  let cohesionRadius = 0;
  let alignmentRadius = 0;

  // Get input elements
  const boidsCountInput = document.getElementById('boids-count');
  const separationInput = document.getElementById('separation');
  const cohesionInput = document.getElementById('cohesion');
  const alignmentInput = document.getElementById('alignment');
  const playButton = document.querySelector('.play-button');
  
  // Get value display elements
  const numberValue = document.getElementById('number-value');
  const separationValue = document.getElementById('separation-value');
  const cohesionValue = document.getElementById('cohesion-value');
  const alignmentValue = document.getElementById('alignment-value');

  // Function to create a boid at random position
  function createBoid() {
    return {
      x: Math.random() * containerWidth,
      y: Math.random() * containerHeight,
      vx: (Math.random() - 0.5) * 2,
      vy: (Math.random() - 0.5) * 2
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
      if (distance > 0 && distance < separationRadius) {
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
      steer.x *= 0.5;
      steer.y *= 0.5;
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
      if (distance > 0 && distance < alignmentRadius) {
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
      steer.x *= 0.3;
      steer.y *= 0.3;
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
      if (distance > 0 && distance < cohesionRadius) {
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
      steer.x *= 0.01;
      steer.y *= 0.01;
    }
    
    return steer;
  }

  // Function to update boid positions
  function updateBoidPositions() {
    boids.forEach(boid => {
      // Apply separation if enabled
      if (separationRadius > 0) {
        let sep = separate(boid);
        boid.vx += sep.x;
        boid.vy += sep.y;
      }
      
      // Apply alignment if enabled
      if (alignmentRadius > 0) {
        let ali = align(boid);
        boid.vx += ali.x;
        boid.vy += ali.y;
      }
      
      // Apply cohesion if enabled
      if (cohesionRadius > 0) {
        let coh = cohesion(boid);
        boid.vx += coh.x;
        boid.vy += coh.y;
      }
      
      // Limit speed
      let speed = Math.sqrt(boid.vx * boid.vx + boid.vy * boid.vy);
      if (speed > 2) {
        boid.vx = (boid.vx / speed) * 2;
        boid.vy = (boid.vy / speed) * 2;
      }
      
      // Update position
      boid.x += boid.vx;
      boid.y += boid.vy;
      
      // Bounce off edges
      if (boid.x < 0 || boid.x > containerWidth) boid.vx = -boid.vx;
      if (boid.y < 0 || boid.y > containerHeight) boid.vy = -boid.vy;
    });
  }

  // Function to draw a single boid
  function drawBoid(boid, index) {
    // Draw visual range for first boid
    if (index === 0) {
      // Find the maximum active radius
      let maxRadius = 10;
      
      if (maxRadius > 0) {
        ctx.fillStyle = 'rgba(255, 0, 0, 0.1)'; // Shallow red with 10% opacity
        ctx.beginPath();
        ctx.arc(boid.x, boid.y, maxRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    
    // Draw the boid
    if (index === 0) {
      ctx.fillStyle = '#ff0000'; // Red for first boid
    } else {
      ctx.fillStyle = '#000000'; // Black for other boids
    }
    
    ctx.beginPath();
    ctx.arc(boid.x, boid.y, 2, 0, Math.PI * 2);
    ctx.fill();
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
      numberValue.textContent = count;
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

  separationInput.addEventListener('input', function() {
    separationRadius = parseFloat(this.value);
    separationValue.textContent = separationRadius;
  });

  cohesionInput.addEventListener('input', function() {
    cohesionRadius = parseFloat(this.value);
    cohesionValue.textContent = cohesionRadius;
  });

  alignmentInput.addEventListener('input', function() {
    alignmentRadius = parseFloat(this.value);
    alignmentValue.textContent = alignmentRadius;
  });

  // Play button event listener
  playButton.addEventListener('click', togglePlay);

  // Initialize with default number of boids
  initializeBoids(1);
  drawBoids();
});
