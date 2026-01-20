(function() {
    const LIGHT_COLOR = '#F3F4F5';
    const DARK_COLOR = '#1D1D1F';
    const TOGGLE_THRESHOLD = 75;
    const HANDLE_RADIUS = 5;
    const HANDLE_HIT_RADIUS = 20; // larger invisible hit area for easier grabbing
    const CORD_LENGTH = 50;
    const CORD_MAX_LENGTH = 100; // maximum stretched length
    const CORD_WIDTH = 1.5;

    // Circle reveal animation
    const CIRCLE_ANIMATION_DURATION = 0.5; // seconds
    const CIRCLE_ANIMATION_EASING = 'cubic-bezier(0.5, 0, 0.75, 0)'; // easeInQuart
    const CIRCLE_START_OFFSET = 50; // distance above window edge

    // Click animation
    const CLICK_PULL_DOWN_DURATION = 75; // ms
    const CLICK_PULL_UP_DURATION = 150; // ms
    const CLICK_PULL_DOWN_EASE = (t) => t * t; // ease in quad
    const CLICK_PULL_UP_EASE = (t) => 1 - (1 - t) * (1 - t); // ease out quad

    // Physics constants
    const GRAVITY = 0.4;
    const DAMPING = 0.95;
    const SNAP_BACK_FORCE = 0.2; // multiplier for initial upward velocity when released while stretched

    // Anchor point (in SVG coordinates)
    const ANCHOR_X = 50;
    const ANCHOR_Y = 0;

    // State
    let isDragging = false;
    let isDarkMode = false;
    let handleX = ANCHOR_X;
    let handleY = CORD_LENGTH;
    let velocityX = 0;
    let velocityY = 0;
    let isAnimating = false;
    let hasCrossedThreshold = false;
    let grabOffsetX = 0; // offset from handle center when grabbed
    let grabOffsetY = 0;

    // DOM Elements
    let container, svg, cordPath, cordHandle, cordHitArea, circleReveal;
    let svgNew, cordPathNew, cordHandleNew; // Duplicate for color transition masking

    function init() {
        createElements();
        setupEventListeners();
        render();
    }

    function createElements() {
        // Create container
        container = document.createElement('div');
        container.className = 'pull-cord-container';

        // Create SVG
        svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '100');
        svg.setAttribute('height', '400');
        svg.style.overflow = 'visible';

        // Create cord path
        cordPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        cordPath.classList.add('cord-path');
        cordPath.setAttribute('stroke-width', CORD_WIDTH);

        // Create handle
        cordHandle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        cordHandle.classList.add('cord-handle');
        cordHandle.setAttribute('r', HANDLE_RADIUS);

        // Create invisible hit area for easier grabbing
        cordHitArea = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        cordHitArea.setAttribute('r', HANDLE_HIT_RADIUS);
        cordHitArea.style.fill = 'transparent';
        cordHitArea.style.cursor = 'grab';

        svg.appendChild(cordPath);
        svg.appendChild(cordHandle);
        svg.appendChild(cordHitArea);
        container.appendChild(svg);

        // Create duplicate SVG for new color (shown inside circle during transition)
        svgNew = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svgNew.setAttribute('width', '100');
        svgNew.setAttribute('height', '400');
        svgNew.style.overflow = 'visible';
        svgNew.style.position = 'absolute';
        svgNew.style.top = '0';
        svgNew.style.left = '0';
        svgNew.style.pointerEvents = 'none';
        svgNew.style.clipPath = 'circle(0px at 0px 0px)';

        cordPathNew = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        cordPathNew.classList.add('cord-path');
        cordPathNew.setAttribute('stroke-width', CORD_WIDTH);

        cordHandleNew = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        cordHandleNew.classList.add('cord-handle');
        cordHandleNew.setAttribute('r', HANDLE_RADIUS);

        svgNew.appendChild(cordPathNew);
        svgNew.appendChild(cordHandleNew);
        container.appendChild(svgNew);

        // Create circle reveal element
        circleReveal = document.createElement('div');
        circleReveal.className = 'circle-reveal';

        document.body.appendChild(container);
        document.body.appendChild(circleReveal);
    }

    function setupEventListeners() {
        // Mouse events - use hit area for interaction
        cordHitArea.addEventListener('mousedown', startDrag);
        document.addEventListener('mousemove', onDrag);
        document.addEventListener('mouseup', endDrag);

        // Touch events
        cordHitArea.addEventListener('touchstart', startDrag, { passive: false });
        document.addEventListener('touchmove', onDrag, { passive: false });
        document.addEventListener('touchend', endDrag);

        // Click to toggle
        cordHitArea.addEventListener('click', handleClick);
    }

    function startDrag(e) {
        e.preventDefault();
        isDragging = true;
        didDrag = false;
        hasCrossedThreshold = false;
        cordHitArea.style.cursor = 'grabbing';

        // Calculate grab offset from handle center
        const rect = container.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const grabX = clientX - rect.left;
        const grabY = clientY - rect.top;
        grabOffsetX = grabX - handleX;
        grabOffsetY = grabY - handleY;
    }

    function onDrag(e) {
        if (!isDragging) return;
        e.preventDefault();
        didDrag = true; // mark that actual dragging occurred

        const rect = container.getBoundingClientRect();
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;

        // Animate grab offset toward zero (centering the handle under the cursor)
        const offsetDecay = 0.1;
        grabOffsetX *= (1 - offsetDecay);
        grabOffsetY *= (1 - offsetDecay);

        // Calculate raw position relative to container origin, accounting for grab offset
        const rawX = clientX - rect.left - grabOffsetX;
        const rawY = Math.max(0, clientY - rect.top - grabOffsetY);

        // Calculate raw distance from anchor
        const rawDx = rawX - ANCHOR_X;
        const rawDy = rawY - ANCHOR_Y;
        const rawDistance = Math.sqrt(rawDx * rawDx + rawDy * rawDy);

        // Check if crossed threshold (using raw distance)
        if (rawDistance > TOGGLE_THRESHOLD && !hasCrossedThreshold) {
            hasCrossedThreshold = true;
            toggleMode();
        }

        // Apply rubber band effect when stretched beyond rest length
        if (rawDistance > CORD_LENGTH) {
            // Calculate how much we're trying to stretch beyond rest length
            const stretchAmount = rawDistance - CORD_LENGTH;
            const maxStretch = CORD_MAX_LENGTH - CORD_LENGTH;

            // Rubber band formula: actual stretch approaches max asymptotically
            // Using formula: actualStretch = maxStretch * (1 - e^(-stretchAmount / maxStretch))
            const rubberStretch = maxStretch * (1 - Math.exp(-stretchAmount / maxStretch));
            const actualDistance = CORD_LENGTH + rubberStretch;

            // Apply the constrained distance in the same direction
            const dirX = rawDx / rawDistance;
            const dirY = rawDy / rawDistance;
            handleX = ANCHOR_X + dirX * actualDistance;
            handleY = ANCHOR_Y + dirY * actualDistance;
        } else {
            handleX = rawX;
            handleY = rawY;
        }

        render();
    }

    function endDrag() {
        if (!isDragging) return;
        isDragging = false;
        cordHitArea.style.cursor = 'grab';

        // Only start physics if actual dragging occurred
        if (!didDrag) return;

        // Calculate snap-back force based on how much the cord was stretched
        const dx = handleX - ANCHOR_X;
        const dy = handleY - ANCHOR_Y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > CORD_LENGTH) {
            const stretchAmount = distance - CORD_LENGTH;
            // Apply initial velocity toward anchor proportional to stretch
            const dirX = dx / distance;
            const dirY = dy / distance;
            velocityX = -dirX * stretchAmount * SNAP_BACK_FORCE;
            velocityY = -dirY * stretchAmount * SNAP_BACK_FORCE;
        }

        // Start physics animation
        startPhysicsAnimation();
    }

    let didDrag = false; // track if actual dragging occurred

    function handleClick(e) {
        // Only trigger click animation if no actual dragging occurred
        if (didDrag) {
            didDrag = false;
            return;
        }
        e.stopPropagation();

        // Animate pull down and up
        animatePull();
    }

    function animatePull() {
        if (isAnimating) return;
        isAnimating = true;

        const pullDistance = TOGGLE_THRESHOLD;
        const startY = handleY;
        let downStartTime = null;
        let upStartTime = null;

        function animateDown(currentTime) {
            if (!downStartTime) downStartTime = currentTime;
            const elapsed = currentTime - downStartTime;
            const progress = Math.min(elapsed / CLICK_PULL_DOWN_DURATION, 1);

            const eased = CLICK_PULL_DOWN_EASE(progress);
            handleY = startY + (pullDistance - startY) * eased;
            handleX = ANCHOR_X;

            render();

            if (progress < 1) {
                requestAnimationFrame(animateDown);
            } else {
                toggleMode();
                requestAnimationFrame(animateUp);
            }
        }

        function animateUp(currentTime) {
            if (!upStartTime) upStartTime = currentTime;
            const elapsed = currentTime - upStartTime;
            const progress = Math.min(elapsed / CLICK_PULL_UP_DURATION, 1);

            const eased = CLICK_PULL_UP_EASE(progress);
            handleY = pullDistance + (CORD_LENGTH - pullDistance) * eased;
            handleX = ANCHOR_X;

            render();

            if (progress < 1) {
                requestAnimationFrame(animateUp);
            } else {
                handleY = CORD_LENGTH;
                isAnimating = false;
                render();
            }
        }

        requestAnimationFrame(animateDown);
    }

    function startPhysicsAnimation() {
        isAnimating = true;

        function animate() {
            if (isDragging) {
                isAnimating = false;
                return;
            }

            // Gravity (always pulls down)
            velocityY += GRAVITY;

            // Apply damping (air resistance)
            velocityX *= DAMPING;
            velocityY *= DAMPING;

            // Update position
            handleX += velocityX;
            handleY += velocityY;

            // Constrain: cord can't stretch beyond rest length during physics
            // (rubber band effect only applies during drag)
            const newDx = handleX - ANCHOR_X;
            const newDy = handleY - ANCHOR_Y;
            const newDistance = Math.sqrt(newDx * newDx + newDy * newDy);

            if (newDistance > CORD_LENGTH) {
                // Project back to rest length circle (cord is taut)
                const newDirX = newDx / newDistance;
                const newDirY = newDy / newDistance;
                handleX = ANCHOR_X + newDirX * CORD_LENGTH;
                handleY = ANCHOR_Y + newDirY * CORD_LENGTH;

                // Remove velocity component away from anchor (can't stretch further)
                const velDot = velocityX * newDirX + velocityY * newDirY;
                if (velDot > 0) {
                    velocityX -= velDot * newDirX;
                    velocityY -= velDot * newDirY;
                }
            }

            // Check if settled at rest position (hanging straight down)
            const restX = ANCHOR_X;
            const restY = ANCHOR_Y + CORD_LENGTH;
            const isSettled =
                Math.abs(velocityX) < 0.05 &&
                Math.abs(velocityY) < 0.05 &&
                Math.abs(handleX - restX) < 0.5 &&
                Math.abs(handleY - restY) < 0.5;

            if (isSettled) {
                handleX = restX;
                handleY = restY;
                velocityX = 0;
                velocityY = 0;
                isAnimating = false;
                render();
                return;
            }

            render();
            requestAnimationFrame(animate);
        }

        requestAnimationFrame(animate);
    }

    function toggleMode() {
        isDarkMode = !isDarkMode;

        // Get the new colors
        const newBgColor = isDarkMode ? DARK_COLOR : LIGHT_COLOR;
        const newCordColor = isDarkMode ? LIGHT_COLOR : DARK_COLOR;
        const oldCordColor = isDarkMode ? DARK_COLOR : LIGHT_COLOR;

        // Set old color on main cord, new color on masked duplicate
        cordPath.style.stroke = oldCordColor;
        cordHandle.style.fill = oldCordColor;
        cordPathNew.style.stroke = newCordColor;
        cordHandleNew.style.fill = newCordColor;

        // Get anchor X position in viewport coordinates
        const rect = container.getBoundingClientRect();
        const anchorScreenX = rect.left + ANCHOR_X;

        // Calculate clip-path center relative to container
        const clipCenterX = ANCHOR_X;
        const clipCenterY = -CIRCLE_START_OFFSET;

        // Position circle above window edge
        circleReveal.style.left = anchorScreenX + 'px';
        circleReveal.style.top = -CIRCLE_START_OFFSET + 'px';
        circleReveal.style.width = (CIRCLE_START_OFFSET * 2) + 'px';
        circleReveal.style.height = (CIRCLE_START_OFFSET * 2) + 'px';
        circleReveal.style.background = newBgColor;

        // Set initial clip-path on new SVG
        svgNew.style.transition = 'none';
        svgNew.style.clipPath = `circle(${CIRCLE_START_OFFSET}px at ${clipCenterX}px ${clipCenterY}px)`;

        // Force reflow
        circleReveal.offsetHeight;
        svgNew.offsetHeight;

        // Calculate the maximum size needed to cover the screen
        const maxDimension = Math.max(window.innerWidth, window.innerHeight) * 3;
        const maxRadius = maxDimension / 2;

        // Animate circle expansion
        circleReveal.style.transition = `width ${CIRCLE_ANIMATION_DURATION}s ${CIRCLE_ANIMATION_EASING}, height ${CIRCLE_ANIMATION_DURATION}s ${CIRCLE_ANIMATION_EASING}`;
        circleReveal.style.width = maxDimension + 'px';
        circleReveal.style.height = maxDimension + 'px';

        // Animate clip-path on new SVG
        svgNew.style.transition = `clip-path ${CIRCLE_ANIMATION_DURATION}s ${CIRCLE_ANIMATION_EASING}`;
        svgNew.style.clipPath = `circle(${maxRadius}px at ${clipCenterX}px ${clipCenterY}px)`;

        // Update body class and reset after animation
        setTimeout(() => {
            document.body.classList.toggle('dark-mode', isDarkMode);
            // Clear inline styles so CSS takes over
            cordPath.style.stroke = '';
            cordHandle.style.fill = '';
            cordPathNew.style.stroke = '';
            cordHandleNew.style.fill = '';
            circleReveal.style.transition = 'none';
            circleReveal.style.width = '0';
            circleReveal.style.height = '0';
            svgNew.style.transition = 'none';
            svgNew.style.clipPath = 'circle(0px at 0px 0px)';
        }, CIRCLE_ANIMATION_DURATION * 1000);
    }

    function render() {
        // Vector from anchor to handle
        const dx = handleX - ANCHOR_X;
        const dy = handleY - ANCHOR_Y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Calculate slack ratio (0 = taut, 1 = fully slack)
        // Use a small transition zone around CORD_LENGTH for smooth interpolation
        const transitionZone = 10;
        const slackAmount = CORD_LENGTH - distance;
        const slackRatio = Math.max(0, Math.min(1, slackAmount / transitionZone));

        // Drape amount scales with slack ratio
        const drapeAmount = slackAmount > 0 ? slackAmount * 0.7 * slackRatio : 0;

        // Control points interpolate between straight line and draped curve
        // For straight line: ctrl1 and ctrl2 would be on the line
        // For draped: ctrl1 goes down, ctrl2 goes below handle

        // Straight line control points (at 1/3 and 2/3 along the line)
        const straightCtrl1X = ANCHOR_X + dx * 0.33;
        const straightCtrl1Y = ANCHOR_Y + dy * 0.33;
        const straightCtrl2X = ANCHOR_X + dx * 0.66;
        const straightCtrl2Y = ANCHOR_Y + dy * 0.66;

        // Draped control points
        const drapedCtrl1X = ANCHOR_X;
        const drapedCtrl1Y = ANCHOR_Y + CORD_LENGTH * 0.5 + drapeAmount * 0.5;
        const drapedCtrl2X = handleX;
        const drapedCtrl2Y = handleY + drapeAmount;

        // Interpolate between straight and draped
        const ctrl1X = straightCtrl1X + (drapedCtrl1X - straightCtrl1X) * slackRatio;
        const ctrl1Y = straightCtrl1Y + (drapedCtrl1Y - straightCtrl1Y) * slackRatio;
        const ctrl2X = straightCtrl2X + (drapedCtrl2X - straightCtrl2X) * slackRatio;
        const ctrl2Y = straightCtrl2Y + (drapedCtrl2Y - straightCtrl2Y) * slackRatio;

        const path = `M ${ANCHOR_X} ${ANCHOR_Y} C ${ctrl1X} ${ctrl1Y}, ${ctrl2X} ${ctrl2Y}, ${handleX} ${handleY}`;

        cordPath.setAttribute('d', path);
        cordHandle.setAttribute('cx', handleX);
        cordHandle.setAttribute('cy', handleY);
        cordHitArea.setAttribute('cx', handleX);
        cordHitArea.setAttribute('cy', handleY);

        // Update duplicate cord for masking
        cordPathNew.setAttribute('d', path);
        cordHandleNew.setAttribute('cx', handleX);
        cordHandleNew.setAttribute('cy', handleY);
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
