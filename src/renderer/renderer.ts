// 渲染进程 - 管理伙伴的视觉表现（纯浏览器脚本，无模块语法）

(function () {
  var SPRITE_DIR = '';

  var currentState = 'idle';
  var bubbleTimeout: ReturnType<typeof setTimeout> | null = null;
  var blinkTimer: ReturnType<typeof setTimeout> | null = null;
  var sleepAnimTimer: ReturnType<typeof setInterval> | null = null;
  var isBlinking = false;

  // 拖拽动画相关
  var dragAnimTimer: ReturnType<typeof setTimeout> | null = null;
  var dragAccumX = 0;
  var dragAccumY = 0;
  var currentDragDirection: string | null = null;
  var dragTransitionDone = false;
  var dragFirstMove = false;
  var isDragVisualActive = false; // 拖拽视觉是否激活（mousedown到mouseup之间）

  var companionEl = document.getElementById('companion')!;
  var spriteEl = document.getElementById('sprite') as HTMLImageElement;
  var bubbleEl = document.getElementById('bubble')!;

  function init(): void {
    // @ts-ignore
    window.companion.onSpritesPath(function (p: string) {
      SPRITE_DIR = 'file:///' + p.replace(/\\/g, '/') + '/';
      setSprite('idle');
      console.log('Sprites path:', SPRITE_DIR);
    });

    setupDragHandling();
    setupCursorTracking();
    setupStateListeners();
    scheduleNextBlink();
    setupClickThrough();
  }

  var isDraggingGlobal = false;

  function setupClickThrough(): void {
    companionEl.addEventListener('mouseenter', function () {
      // @ts-ignore
      window.companion.sendMouseEnter();
    });
    companionEl.addEventListener('mouseleave', function () {
      // 拖拽期间不切换穿透，否则鼠标离开角色区域后拖拽会断
      if (isDraggingGlobal) return;
      // @ts-ignore
      window.companion.sendMouseLeave();
    });
  }

  function setupDragHandling(): void {
    var isDragging = false;

    companionEl.addEventListener('mousedown', function () {
      isDragging = true;
      isDraggingGlobal = true;
      isDragVisualActive = true;
      dragFirstMove = true;
      dragTransitionDone = false;
      dragAccumX = 0;
      dragAccumY = 0;
      currentDragDirection = null;
      setSprite('dragged');
      // @ts-ignore
      window.companion.sendDragStart();
    });

    document.addEventListener('mousemove', function (e: MouseEvent) {
      if (!isDragging) return;
      if (e.movementX === 0 && e.movementY === 0) return;

      // 方向判定（视觉用）
      if (dragFirstMove) {
        dragFirstMove = false;
        playDragTransition();
      }
      updateDragDirection(e.movementX, e.movementY);
    });

    document.addEventListener('mouseup', function () {
      if (isDragging) {
        isDragging = false;
        isDraggingGlobal = false;
        isDragVisualActive = false;
        stopDragAnim();
        // @ts-ignore
        window.companion.sendDragEnd();
      }
    });
  }

  /** 播放 dragged_1 → dragged_2 过渡动画 */
  function playDragTransition(): void {
    setSprite('dragged_1');
    dragAnimTimer = setTimeout(function () {
      setSprite('dragged_2');
      dragAnimTimer = setTimeout(function () {
        dragTransitionDone = true;
        // 过渡结束，立即应用已累积的方向
        updateDragDirection(0, 0);
      }, 200);
    }, 200);
  }

  /** 停止拖拽动画 */
  function stopDragAnim(): void {
    if (dragAnimTimer) {
      clearTimeout(dragAnimTimer);
      dragAnimTimer = null;
    }
    dragTransitionDone = false;
    dragFirstMove = false;
    currentDragDirection = null;
  }

  /** 根据最近的移动量更新方向差分（衰减累积） */
  function updateDragDirection(dx: number, dy: number): void {
    // 衰减旧值，保留近期趋势
    dragAccumX = dragAccumX * 0.6 + dx;
    dragAccumY = dragAccumY * 0.6 + dy;

    // 过渡动画还没结束时不切换精灵图
    if (!dragTransitionDone) return;

    var absX = Math.abs(dragAccumX);
    var absY = Math.abs(dragAccumY);

    // 累积值不够大时保持当前方向
    if (absX < 3 && absY < 3) return;

    var newDirection: string;
    if (absX > absY) {
      newDirection = dragAccumX > 0 ? 'right' : 'left';
    } else {
      newDirection = dragAccumY > 0 ? 'down' : 'up';
    }

    if (newDirection !== currentDragDirection) {
      currentDragDirection = newDirection;
      setSprite('dragged_' + newDirection);
    }
  }

  function setupCursorTracking(): void {
    document.addEventListener('mousemove', function (e: MouseEvent) {
      // @ts-ignore
      window.companion.sendCursorMove({ x: e.screenX, y: e.screenY });
    });

    companionEl.addEventListener('click', function () {
      // @ts-ignore
      window.companion.sendClick();
    });
  }

  function setupStateListeners(): void {
    // @ts-ignore
    window.companion.onStateUpdate(function (data: any) {
      updateVisual(data.state, data.definition);
    });

    // @ts-ignore
    window.companion.onStateChanged(function (event: any) {
      currentState = event.to;
      onStateEnter(event.to);
    });
  }

  function setSprite(name: string): void {
    if (!SPRITE_DIR) return;
    spriteEl.src = SPRITE_DIR + name + '.png';
  }

  function stopSleepAnim(): void {
    if (sleepAnimTimer) {
      clearInterval(sleepAnimTimer);
      sleepAnimTimer = null;
    }
  }

  function startSleepAnim(): void {
    stopSleepAnim();
    var frames = ['sleep_1', 'sleep_2', 'sleep_3'];
    var frameIndex = 0;
    sleepAnimTimer = setInterval(function () {
      frameIndex = (frameIndex + 1) % frames.length;
      setSprite(frames[frameIndex]);
    }, 1500);
  }

  function updateVisual(state: string, _definition: any): void {
    stopSleepAnim();
    if (isBlinking && state === 'idle') return;
    // 拖拽期间不覆盖精灵图
    if (isDragVisualActive) return;

    switch (state) {
      case 'idle':
        companionEl.className = 'breathing';
        setSprite('idle');
        break;
      case 'curious':
        companionEl.className = 'curious';
        setSprite('idle');
        break;
      case 'dragged':
        companionEl.className = 'dragged';
        // 不覆盖拖拽动画，由 setupDragHandling 控制精灵图
        break;
      case 'sleepy':
        companionEl.className = 'sleepy';
        setSprite('sleepy');
        break;
      case 'sleeping':
        companionEl.className = 'sleeping';
        setSprite('sleep_1');
        startSleepAnim();
        break;
      case 'lonely':
        companionEl.className = 'lonely';
        setSprite('lonely');
        break;
      case 'comfortable':
        companionEl.className = 'comfortable';
        setSprite('comfortable');
        break;
    }
  }

  function onStateEnter(state: string): void {
    maybeShowBubble(state);
  }

  function maybeShowBubble(state: string): void {
    var bubbleData = getBubbleForState(state);
    if (!bubbleData) return;

    if (Math.random() < bubbleData.probability) {
      showBubble(bubbleData.messages[Math.floor(Math.random() * bubbleData.messages.length)]);
    }
  }

  function getBubbleForState(state: string): { probability: number; messages: string[] } | null {
    var bubbles: Record<string, { probability: number; messages: string[] }> = {
      idle: { probability: 0.05, messages: ['~', '...', '♪'] },
      curious: { probability: 0.15, messages: ['?', '~?', '嗯？'] },
      dragged: { probability: 0.3, messages: ['哇', '...', '～'] },
      sleepy: { probability: 0.1, messages: ['好困...', 'zzZ', '呼...'] },
      lonely: { probability: 0.08, messages: ['...', '在吗', '嗯...'] },
      comfortable: { probability: 0.1, messages: ['嘿嘿', '~', '♪~'] },
    };
    return bubbles[state] ?? null;
  }

  function showBubble(text: string): void {
    if (bubbleTimeout) {
      clearTimeout(bubbleTimeout);
    }

    bubbleEl.textContent = text;
    bubbleEl.classList.remove('hidden');
    bubbleEl.classList.add('visible');

    bubbleTimeout = setTimeout(function () {
      bubbleEl.classList.remove('visible');
      setTimeout(function () { bubbleEl.classList.add('hidden'); }, 500);
    }, 3000);
  }

  function scheduleNextBlink(): void {
    var interval;
    if (currentState === 'curious') {
      // curious: 2~6秒，更快
      interval = 2000 + Math.random() * 2000 + Math.random() * 2000;
    } else {
      // idle: 2~8秒
      interval = 2000 + Math.random() * 3000 + Math.random() * 3000;
    }
    blinkTimer = setTimeout(function () {
      if (currentState === 'idle' || currentState === 'curious') {
        performBlink();
      }
      scheduleNextBlink();
    }, interval);
  }

  function performBlink(): void {
    if (!SPRITE_DIR) return;
    isBlinking = true;
    var speed: number;
    if (currentState === 'curious') {
      // curious: 70~130ms，更快
      speed = 70 + Math.random() * 60;
    } else {
      // idle: 80~150ms
      speed = 80 + Math.random() * 70;
    }
    setSprite('idle_blink_1');
    setTimeout(function () {
      setSprite('idle_blink_2');
      setTimeout(function () {
        setSprite('idle_blink_1');
        setTimeout(function () {
          setSprite('idle');
          isBlinking = false;
        }, speed);
      }, speed);
    }, speed);
  }

  init();
})();
