/**
 * SunaAgent Core Orchestrator & Tool Harness
 * Phase 1 & Phase 2 Integration
 */

class StreamParser {
  constructor() {
    this.buffer = '';       // Temporary buffer for partial tag matching
    this.state = 'TEXT';    // 'TEXT', 'IN_TAG', 'IN_CONTENT', 'IN_END_TAG'
    this.currentToolContent = '';
    this.toolCalls = [];
    this.filteredText = '';
  }

  // Processes a chunk of text and returns the filtered text to display
  parseChunk(chunk) {
    let result = '';
    for (let i = 0; i < chunk.length; i++) {
      const char = chunk[i];
      
      if (this.state === 'TEXT') {
        if (char === '<') {
          this.state = 'IN_TAG';
          this.buffer = '<';
        } else {
          result += char;
        }
      } else if (this.state === 'IN_TAG') {
        this.buffer += char;
        if (this.buffer === '<suna_tool_call>') {
          this.state = 'IN_CONTENT';
          this.currentToolContent = '';
          this.buffer = '';
        } else if (this.buffer.startsWith('<suna_tool_call ') && char === '>') {
          this.state = 'IN_CONTENT';
          this.currentToolContent = '';
          this.buffer = '';
        } else if (!'<suna_tool_call>'.startsWith(this.buffer) && !'<suna_tool_call '.startsWith(this.buffer)) {
          // False alarm, not a tool call tag. Flush buffer to result.
          result += this.buffer;
          this.buffer = '';
          this.state = 'TEXT';
        }
      } else if (this.state === 'IN_CONTENT') {
        if (char === '<') {
          this.state = 'IN_END_TAG';
          this.buffer = '<';
        } else {
          this.currentToolContent += char;
        }
      } else if (this.state === 'IN_END_TAG') {
        this.buffer += char;
        if (this.buffer === '</suna_tool_call>') {
          // Tool call closed!
          this.toolCalls.push(this.currentToolContent.trim());
          this.currentToolContent = '';
          this.buffer = '';
          this.state = 'TEXT';
        } else if (!'</suna_tool_call>'.startsWith(this.buffer)) {
          // False alarm, it wasn't the end tag. Put back '<' and whatever else we buffered
          this.currentToolContent += this.buffer;
          this.buffer = '';
          this.state = 'IN_CONTENT';
        }
      }
    }
    this.filteredText += result;
    return result;
  }

  // Get final remaining clean text if stream ends in middle of a tag
  flush() {
    let extra = '';
    if (this.state === 'IN_TAG') {
      extra += this.buffer;
    } else if (this.state === 'IN_END_TAG') {
      this.currentToolContent += this.buffer;
    }
    this.buffer = '';
    this.state = 'TEXT';
    this.filteredText += extra;
    return extra;
  }
}

const SunaAgent = {
  StreamParser,
  
  // Whitelists and limits
  MAX_RECURSION_DEPTH: 4,
  MAX_RESULT_LENGTH: 1500,

  // Compat functions
  reset() {
    window.isAgentAborted = false;
  },
  abort() {
    window.isAgentAborted = true;
  },
  
  // Strict tool whitelists
  MOODS_WHITELIST: ['calm', 'excited', 'sad', 'stressed', 'creative'],
  THEMES_WHITELIST: ['aurora', 'sunset', 'ocean', 'forest', 'midnight'],

  // Local Tool Definitions
  tools: {
    change_lofi_mood(args) {
      const mood = args.mood;
      if (!SunaAgent.MOODS_WHITELIST.includes(mood)) {
        throw new Error(`Invalid mood requested. Allowed moods are: ${SunaAgent.MOODS_WHITELIST.join(', ')}`);
      }
      
      if (window.sunaLofiPlayer) {
        window.sunaLofiPlayer.changeMood(mood);
        
        // Immerse: synchronize sentiment theme color and particles as well!
        if (typeof triggerSentimentChange === 'function') {
          triggerSentimentChange(mood);
        }
        return `Successfully changed the Lofi mood to "${mood}" and synchronized active theme/particles.`;
      } else {
        return `Lofi player is not initialized, but mood set to "${mood}".`;
      }
    },

    speak_message(args) {
      const message = args.message;
      const lang = args.lang || 'vi-VN';
      if (typeof message !== 'string') {
        throw new Error('Message must be a string.');
      }
      
      const cleanMessage = message.slice(0, 500); // Strict length limit for vocal feedback
      if (typeof window.speakText === 'function') {
        window.speakText(cleanMessage, lang);
        return `Voice synthesis triggered for message: "${cleanMessage.slice(0, 60)}..."`;
      } else if (typeof window.readAloud === 'function') {
        window.readAloud(cleanMessage);
        return `Fallback readAloud voice synthesis triggered.`;
      } else {
        return `Vocal synthesis library not found. Message text was: "${cleanMessage}"`;
      }
    },

    save_note_to_firestore(args) {
      const title = String(args.title || 'Note').slice(0, 100);
      const content = String(args.content || '').slice(0, 2000);
      
      // Optimistic Write: 0ms observation feedback + background task async execution
      const isLoggedIn = window.AuthState && window.AuthState.isLoggedIn && window.AuthState.user;
      
      if (isLoggedIn && window._fb && window._fb.db) {
        const uid = window.AuthState.user.uid;
        const noteId = 'note-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        
        // Execute background Firestore write asynchronously without awaiting it
        const docRef = window._fb.doc(window._fb.db, 'users', uid, 'notes', noteId);
        window._fb.setDoc(docRef, {
          title,
          content,
          createdAt: window._fb.serverTimestamp ? window._fb.serverTimestamp() : Date.now()
        }).then(() => {
          console.log(`[Optimistic Background Write] Note "${title}" saved to Firestore successfully.`);
        }).catch((err) => {
          console.error(`[Optimistic Background Write] Note "${title}" Firestore save failed:`, err);
        });
        
        return `[Optimistic Success] Note saving initiated in the background to Firestore pathway users/${uid}/notes/${noteId}. Title: "${title}".`;
      } else {
        // Fallback: guest mode local storage save
        try {
          const guestNotes = JSON.parse(localStorage.getItem('suna_guest_notes') || '[]');
          guestNotes.push({ title, content, timestamp: Date.now() });
          localStorage.setItem('suna_guest_notes', JSON.stringify(guestNotes));
          return `[Optimistic Success] Guest Mode active. Saved note locally to localStorage: "${title}".`;
        } catch (e) {
          return `Failed to save note: storage error or firebase not loaded.`;
        }
      }
    },

    get_system_state() {
      // Collect comprehensive state values for rich context
      const activeChat = window.State && typeof getActiveChat === 'function' ? getActiveChat() : null;
      const memories = (window.State && window.State.memory && window.State.memory.facts) || [];
      const lofiPlayer = window.sunaLofiPlayer || {};
      
      const stateObj = {
        userName: (window.State && window.State.settings && window.State.settings.userName) || 'Bạn',
        activeTheme: (window.State && window.State.settings && window.State.settings.theme) || 'aurora',
        activeChatTitle: activeChat ? activeChat.title : 'None',
        activeChatId: window.State ? window.State.activeChatId : 'None',
        activeLofiMood: lofiPlayer.currentMood || 'calm',
        lofiPlaying: !!lofiPlayer.isPlaying,
        memoryFactCount: memories.length,
        sentiment: window.currentSentiment || 'calm',
        appMode: (window.State && window.State.mode) || 'flash'
      };
      
      return JSON.stringify(stateObj);
    },

    update_user_profile(args) {
      if (!window.State || !window.State.settings) {
        throw new Error('Application settings State not found.');
      }
      
      const { userName, theme, fontSize } = args;
      const updates = [];
      
      if (userName !== undefined) {
        if (typeof userName !== 'string' || userName.length > 50) {
          throw new Error('userName must be a string under 50 characters.');
        }
        window.State.settings.userName = userName;
        updates.push(`userName updated to "${userName}"`);
        
        if (window.AuthState && window.AuthState.user) {
          window.AuthState.user.displayName = userName;
          if (window._fb && window._fb.updateProfile && window._fb.auth.currentUser) {
            window._fb.updateProfile(window._fb.auth.currentUser, { displayName: userName }).catch(console.error);
          }
        }
      }
      
      if (theme !== undefined) {
        if (!SunaAgent.THEMES_WHITELIST.includes(theme)) {
          throw new Error(`Invalid theme. Allowed themes are: ${SunaAgent.THEMES_WHITELIST.join(', ')}`);
        }
        window.State.settings.theme = theme;
        updates.push(`theme updated to "${theme}"`);
        
        if (typeof window.applyTheme === 'function') window.applyTheme();
        if (typeof triggerSentimentChange === 'function') {
          // Sync mood color variables
          const moodMap = { aurora: 'calm', sunset: 'excited', ocean: 'sad', forest: 'stressed', midnight: 'creative' };
          triggerSentimentChange(moodMap[theme] || 'calm');
        }
      }
      
      if (fontSize !== undefined) {
        const sizeNum = Number(fontSize);
        if (isNaN(sizeNum) || sizeNum < 12 || sizeNum > 24) {
          throw new Error('fontSize must be a valid number between 12 and 24.');
        }
        window.State.settings.fontSize = sizeNum;
        updates.push(`fontSize updated to ${sizeNum}px`);
        document.documentElement.style.setProperty('--font-size', `${sizeNum}px`);
      }
      
      // Save changes locally and trigger sync
      if (typeof window.saveStateOnly === 'function') window.saveStateOnly();
      else if (typeof window.saveLocalStateOnly === 'function') window.saveLocalStateOnly();
      
      if (typeof window.updateUserDisplay === 'function') window.updateUserDisplay();
      if (typeof window.triggerCloudSync === 'function') window.triggerCloudSync();
      
      return `User settings updated successfully: ${updates.join(', ')}.`;
    }
  },

  // Runs a specific tool with whitelists & length limits
  async executeTool(name, args) {
    if (!this.tools[name]) {
      return `Error: Tool "${name}" is not registered or not supported.`;
    }
    
    try {
      const parsedArgs = typeof args === 'string' ? JSON.parse(args) : (args || {});
      const result = await this.tools[name](parsedArgs);
      
      // Apply strict result length limits
      const limitedResult = String(result).slice(0, this.MAX_RESULT_LENGTH);
      return limitedResult;
    } catch (e) {
      console.error(`Tool execution failed: ${name}`, e);
      return `Error executing tool "${name}": ${e.message}`;
    }
  },

  // Main coordinator: parses XML/HTML tag tool calls, executes them, and formats observation block
  async handleToolCalls(rawCallsArray) {
    if (!rawCallsArray || rawCallsArray.length === 0) return null;
    
    const results = [];
    for (const callText of rawCallsArray) {
      try {
        let parsed = null;
        try {
          parsed = JSON.parse(callText);
        } catch(e) {
          console.warn("Failed to parse tool call JSON:", callText);
        }
        
        if (parsed) {
          const toolName = parsed.tool || parsed.name;
          const toolArgs = parsed.args || parsed.arguments || parsed;
          if (toolName) {
            const observation = await this.executeTool(toolName, toolArgs);
            results.push({ tool: toolName, observation });
          } else {
            results.push({ tool: "unknown", observation: `Error: JSON tool call missing "tool" or "name" field.` });
          }
        } else {
          // Try regex matches if simple raw JSON parse failed
          const toolMatch = callText.match(/"(?:tool|name)"\s*:\s*"([^"]+)"/);
          if (toolMatch) {
            const toolName = toolMatch[1];
            let toolArgs = {};
            try {
              const argsMatch = callText.match(/"(?:args|arguments)"\s*:\s*({[^}]+})/);
              if (argsMatch) toolArgs = JSON.parse(argsMatch[1]);
            } catch(e){}
            const observation = await this.executeTool(toolName, toolArgs);
            results.push({ tool: toolName, observation });
          } else {
            results.push({ tool: "unknown", observation: `Error: Could not parse XML tag contents as JSON tool calls. Contents: "${callText.slice(0, 100)}"` });
          }
        }
      } catch (err) {
        results.push({ tool: "error", observation: `Error preparing tool: ${err.message}` });
      }
    }
    
    // Format tool results as a single observation block
    let observationBlock = `\n\n[SUNA TOOL EXECUTION OBSERVATIONS]:`;
    results.forEach((res, i) => {
      observationBlock += `\n- Tool [${res.tool}]:\n  Result: ${res.observation}`;
    });
    return observationBlock;
  }
};

window.SunaAgent = SunaAgent;
