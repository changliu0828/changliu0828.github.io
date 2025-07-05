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

  // === CONSTANTS ===
  // Drawing constants
  const BOID_COLORS = {
    NORMAL: 'rgba(0, 0, 0, 1)',
    HIGHLIGHT: 'rgba(255, 0, 0, 1)',
    PERCEPTION_RANGE: 'rgba(255, 0, 0, 0.1)'
  };

  // Triangle geometry constants
  const TRIANGLE = {
    SIZE: 4,                    // Distance from center to vertices
    APEX_ANGLE: 0.698,         // 40° in radians
    BASE_ANGLE_OFFSET: 2.44    // 140° in radians (for 70° base angles)
  };

  // Physics constants
  const PHYSICS = {
    MAX_SPEED: 2,
    SEPARATION_WEIGHT: 1,
    COHESION_WEIGHT: 0.04,
    ALIGNMENT_WEIGHT: 0.1
  };

  // Legacy constants (for compatibility)
  const maxSpeed = PHYSICS.MAX_SPEED;
  const maxSeparationValue = parseInt(document.getElementById('separation').attributes['max'].value);
  const maxCohesionValue = parseInt(document.getElementById('cohesion').attributes['max'].value);
  const maxAlignmentValue = parseInt(document.getElementById('alignment').attributes['max'].value);
  const separationWeight = PHYSICS.SEPARATION_WEIGHT;
  const cohesionWeight = PHYSICS.COHESION_WEIGHT;
  const alignmentWeight = PHYSICS.ALIGNMENT_WEIGHT;

  // === UTILITY FUNCTIONS ===
  
  function random(min, max) {
    return Math.random() * (max - min) + min;
  }

  // === BOID CREATION AND MANAGEMENT ===
  
  /**
   * Create a boid at random position with random velocity
   * @returns {Object} New boid object with x, y, vx, vy properties
   */
  function createBoid() {
    return {
      x: random(0, containerWidth),
      y: random(0, containerHeight),
      vx: random(-maxSpeed, maxSpeed),
      vy: random(-maxSpeed, maxSpeed),
    };
  }

  /**
   * Initialize boids array with specified count
   * @param {number} count - Number of boids to create
   */
  function initializeBoids(count) {
    boids = [];
    for (let i = 0; i < count; i++) {
      boids.push(createBoid());
    }
  }

  /**
   * Adjust boids count without regenerating existing positions
   * @param {number} newCount - New desired number of boids
   */
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

  // === FLOCKING BEHAVIOR FUNCTIONS ===
  
  /**
   * Calculate separation force - boids avoid crowding neighbors
   * @param {Object} boid - The boid to calculate separation for
   * @returns {Object} Steering force vector {x, y}
   */
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

  /**
   * Calculate alignment force - boids align with neighbors' velocities
   * @param {Object} boid - The boid to calculate alignment for
   * @returns {Object} Steering force vector {x, y}
   */
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

  /**
   * Calculate cohesion force - boids steer towards center of mass of neighbors
   * @param {Object} boid - The boid to calculate cohesion for
   * @returns {Object} Steering force vector {x, y}
   */
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

  // === PHYSICS AND MOVEMENT FUNCTIONS ===
  
  /**
   * Limit boid speed to maximum allowed speed
   * @param {Object} boid - The boid to limit speed for
   */
  function limitSpeed(boid) {
    let speed = Math.sqrt(boid.vx * boid.vx + boid.vy * boid.vy);
    if (speed > maxSpeed) {
      boid.vx = (boid.vx / speed) * maxSpeed;
      boid.vy = (boid.vy / speed) * maxSpeed;
    }
  }

  /**
   * Keep boid within canvas bounds with smooth turning
   * @param {Object} boid - The boid to constrain within bounds
   */
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

  // === ANIMATION AND UPDATE FUNCTIONS ===
  
  /**
   * Update positions of all boids based on flocking rules
   */
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

  /**
   * Calculate triangle vertices for a boid based on its velocity direction
   * 
   * Triangle geometry:
   *       /\     <- 40° apex angle (pointing in velocity direction)
   *      /  \
   *     /____\   <- 70° base angles
   * 
   * @param {Object} boid - The boid object with x, y, vx, vy properties
   * @returns {Array} Array of three vertex objects with x, y coordinates
   */
  function getTriangleVertices(boid) {
    // Handle zero velocity case to prevent NaN coordinates
    if (boid.vx === 0 && boid.vy === 0) {
      // Point upward when no velocity
      const velocityAngle = -Math.PI / 2;
      return calculateVerticesFromAngle(boid, velocityAngle);
    }
    
    const velocityAngle = Math.atan2(boid.vy, boid.vx);
    return calculateVerticesFromAngle(boid, velocityAngle);
  }

  /**
   * Helper function to calculate triangle vertices from a given angle
   * @param {Object} boid - The boid object
   * @param {number} angle - The angle in radians
   * @returns {Array} Array of three vertex objects
   */
  function calculateVerticesFromAngle(boid, angle) {
    // Front vertex (40° angle pointing in velocity direction)
    const frontVertex = {
      x: boid.x + TRIANGLE.SIZE * Math.cos(angle),
      y: boid.y + TRIANGLE.SIZE * Math.sin(angle)
    };
    
    // Base vertices (70° angles each, offset by ±140° from velocity direction)
    const baseVertex1 = {
      x: boid.x + TRIANGLE.SIZE * Math.cos(angle + TRIANGLE.BASE_ANGLE_OFFSET),
      y: boid.y + TRIANGLE.SIZE * Math.sin(angle + TRIANGLE.BASE_ANGLE_OFFSET)
    };
    
    const baseVertex2 = {
      x: boid.x + TRIANGLE.SIZE * Math.cos(angle - TRIANGLE.BASE_ANGLE_OFFSET),
      y: boid.y + TRIANGLE.SIZE * Math.sin(angle - TRIANGLE.BASE_ANGLE_OFFSET)
    };
    
    return [frontVertex, baseVertex1, baseVertex2];
  }

  // === DRAWING FUNCTIONS ===
  
  /**
   * Draw a normal boid as a triangle pointing in its velocity direction
   * @param {Object} boid - The boid object to draw
   */
  function drawNormalBoid(boid) {
    ctx.fillStyle = BOID_COLORS.NORMAL;
    const vertices = getTriangleVertices(boid);
    
    ctx.beginPath();
    ctx.moveTo(vertices[0].x, vertices[0].y);
    ctx.lineTo(vertices[1].x, vertices[1].y);
    ctx.lineTo(vertices[2].x, vertices[2].y);
    ctx.closePath();
    ctx.fill();
  }

  /**
   * Draw a highlighted boid with its perception range
   * @param {Object} boid - The boid object to draw
   */
  function drawHighlightBoid(boid) {
    ctx.fillStyle = BOID_COLORS.HIGHLIGHT;
    const vertices = getTriangleVertices(boid);
    
    ctx.beginPath();
    ctx.moveTo(vertices[0].x, vertices[0].y);
    ctx.lineTo(vertices[1].x, vertices[1].y);
    ctx.lineTo(vertices[2].x, vertices[2].y);
    ctx.closePath();
    ctx.fill();

    // Draw perception range
    ctx.fillStyle = BOID_COLORS.PERCEPTION_RANGE;
    ctx.beginPath();
    ctx.arc(boid.x, boid.y, perceptionValue, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Draw a single boid (either normal or highlighted)
   * @param {Object} boid - The boid to draw
   * @param {number} index - The index of the boid in the array
   */
  function drawBoid(boid, index) {
    // Draw perception range for first boid if highlight is checked
    if (index === 0 && highlightInput.checked) {
      drawHighlightBoid(boid);
    } else {
      drawNormalBoid(boid);
    }
  }

  /**
   * Clear canvas and draw all boids
   */
  function drawBoids() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw each boid
    boids.forEach((boid, index) => {
      drawBoid(boid, index);
    });
  }

  /**
   * Main animation loop - updates and draws boids when playing
   */
  function animate() {
    if (isPlaying) {
      updateBoidPositions();
      drawBoids();
    }
  }

  // === MAIN CONTROL FUNCTIONS ===
  
  /**
   * Update boids count based on input value
   */
  function updateBoids() {
    const count = parseInt(boidsCountInput.value);
    if (count >= 1 && count <= 100) {
      adjustBoidsCount(count);
      drawBoids();
      numberDisplayed.textContent = count;
    }
  }

  /**
   * Toggle play/pause state of the animation
   */
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

  // === EVENT LISTENERS ===
  
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

  // === INITIALIZATION ===
  
  // Initialize with default number of boids
  initializeBoids(1);
  drawBoids();
});
