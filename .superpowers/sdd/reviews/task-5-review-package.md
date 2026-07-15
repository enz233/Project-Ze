571bca9 fix: cancel stale screen pointer sessions

--- STAT ---
 src/core/chat-manager.ts | 1 +
 1 file changed, 1 insertion(+)

--- DIFF ---
diff --git a/src/core/chat-manager.ts b/src/core/chat-manager.ts
index 62e43ac..75cf9c7 100644
--- a/src/core/chat-manager.ts
+++ b/src/core/chat-manager.ts
@@ -80,20 +80,21 @@ export class ChatManager {
     this.isProcessing = true;
     this.lastUserInteraction = Date.now();
     this.emotionUpdater.onInteraction();
     this.sendBubble('思考中...');
     this.sendChatStatus('thinking', '思考中...');
 
     try {
       // 检查是否为屏幕分析请求（"." 开头）
       if (userMessage.startsWith('.')) {
         const screenMessage = userMessage.slice(1).trim() || '描述一下屏幕上有什么';
+        this.screenTargetPointer?.cancel('new-request');
         this.sendChatStatus('screen', '正在看屏幕...');
 
         if (this.screenTargetPointer?.isPointerRequest(screenMessage)) {
           const pointerResult = await this.screenTargetPointer.handle(screenMessage);
           const assistantMessage = pointerResult.message || '屏幕指示请求已取消';
           this.memory.addMessage('user', userMessage);
           this.memory.addMessage('assistant', assistantMessage);
           this.memory.recordInteraction('screen-target-pointer', screenMessage, this.stateManager.getCurrentState());
           return;
         }
