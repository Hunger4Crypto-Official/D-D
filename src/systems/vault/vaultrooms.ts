{
  "schema_version": "1.0",
  "content_id": "genesis",
  "book_id": "book_1",
  "scene_id": "2.1.dev",
  "title": "The Code Chamber — Developer's Path",
  "narration": "Arrays of floating screens cascade logic in pristine syntax. Each display shows fragments of the Vault's underlying architecture—not stone and crystal, but functions and data structures that pulse with algorithmic life. You recognize the patterns immediately: recursive loops that govern the gremlin spawning, hash functions that validate each transaction, and elegant state machines that orchestrate the entire experience.\n\nA massive holographic terminal materializes before you, its interface both familiar and alien. Code scrolls past in languages you've never seen but somehow understand: blockchain assembly instructions mixed with ancient SQL queries, JavaScript promises that resolve into physical manifestations, and Python decorators that literally decorate the walls with shimmering mathematical proofs.\n\nThe chamber responds to your presence, highlighting inefficiencies in the Vault's codebase with gentle amber warnings. Here, a nested loop that could be optimized. There, a database query that's hitting without an index. Your developer instincts flare—this place needs refactoring, and you're exactly the person to do it.\n\nGremlins peek out from behind server racks, their eyes now displaying terminal prompts. One approaches with a tiny laptop, screen showing: `git blame` on a function called `reality_engine()`. The commit history stretches back millennia.",
  "rounds": [
    {
      "round_id": "2.1-dev-R1",
      "description": "The terminal awaits your input. Code fragments swirl around you like autumn leaves, each one a potential optimization or dangerous bug. The chamber hums with the sound of cooling fans and distant compilation processes.",
      "actions": [
        {
          "id": "optimize_loop",
          "label": "Optimize the Core Loop",
          "requirements": { "items_any": [], "flags_all": [] },
          "roll": { "kind": "phi_d20", "tags": ["dev", "logic", "optimization"] },
          "outcomes": {
            "crit_success": {
              "effects": [
                { "type": "focus", "op": "+", "value": 3 },
                { "type": "flag", "id": "master_optimizer", "value": true },
                { "type": "item", "id": "algorithm_crystal" }
              ],
              "narration": "Your fingers dance across the terminal with surgical precision. You identify the bottleneck immediately—a naive O(n²) algorithm where a hash map could deliver O(1) performance. As you refactor, the entire chamber brightens. Server fans quiet to whispers, and the code executes with breathtaking efficiency. The Vault itself seems to exhale in relief. A crystal materializes, containing the compressed essence of your optimization—a perfect algorithm that could revolutionize any system."
            },
            "success": {
              "effects": [
                { "type": "focus", "op": "+", "value": 2 },
                { "type": "xp", "value": 40 }
              ],
              "narration": "You spot several opportunities for improvement and implement them methodically. The code becomes cleaner, more maintainable. The chamber approves with a satisfied electronic purr as processing loads decrease across all systems."
            },
            "fail": {
              "effects": [
                { "type": "focus", "op": "-", "value": 1 }
              ],
              "narration": "Your optimization attempt introduces a subtle race condition. Error messages cascade across the screens before the chamber's built-in rollback system restores the previous state. A gremlin pats your shoulder sympathetically and offers you a debugging duck."
            },
            "crit_fail": {
              "effects": [
                { "type": "focus", "op": "-", "value": 2 },
                { "type": "hp", "op": "-", "value": 1 }
              ],
              "narration": "Your 'fix' triggers a stack overflow that threatens to crash reality itself. Alarms blare as emergency systems engage, restoring from the last stable checkpoint. The chamber dims disapprovingly, and you earn the scornful gaze of several monitoring gremlins."
            }
          },
          "banter": {
            "dev": "Time complexity is just a suggestion until it isn't.",
            "trader": "Efficiency gains translate to profit margins.",
            "whale": "Scale demands optimization at every layer.",
            "hacker": "There's always a faster path through the maze.",
            "shiller": "This optimization story will trend on DevTwitter.",
            "validator": "Clean code validates more than just transactions.",
            "miner": "Better algorithms mine better outcomes.",
            "meme": "Big O notation but make it stylish."
          }
        },
        {
          "id": "debug_reality",
          "label": "Debug the Reality Engine",
          "requirements": { "items_any": [], "flags_all": [] },
          "roll": { "kind": "phi_d20", "tags": ["dev", "debugging", "insight"] },
          "outcomes": {
            "crit_success": {
              "effects": [
                { "type": "flag", "id": "reality_debugger", "value": true },
                { "type": "xp", "value": 60 },
                { "type": "item", "id": "debug_lens" }
              ],
              "narration": "You dive deep into the reality engine's source code, following execution paths through dimensions of logic that normal minds cannot perceive. In the deepest functions, you discover the fundamental bug that's been causing minor glitches throughout the Vault—a single misplaced semicolon that's been propagating chaos for centuries. When you fix it, the entire chamber shimmers as reality renders more smoothly. A debug lens materializes, allowing you to see the code layer underlying all existence."
            },
            "success": {
              "effects": [
                { "type": "flag", "id": "debugger", "value": true },
                { "type": "xp", "value": 30 }
              ],
              "narration": "Your debugging skills serve you well. You identify several memory leaks and null pointer exceptions, patching them with elegant error handling. The reality engine runs more smoothly, and you gain insight into how the Vault's underlying systems function."
            },
            "fail": {
              "effects": [
                { "type": "hp", "op": "-", "value": 2 }
              ],
              "narration": "The reality engine's complexity overwhelms your mental debugger. Infinite recursion loops through your consciousness until the chamber's safety systems kick in, forcibly terminating the debugging session."
            }
          }
        },
        {
          "id": "refactor_legacy",
          "label": "Refactor Legacy Gremlin Code",
          "requirements": { "items_any": [], "flags_all": [] },
          "roll": { "kind": "phi_d20", "tags": ["dev", "legacy", "gremlin"] },
          "outcomes": {
            "crit_success": {
              "effects": [
                { "type": "flag", "id": "gremlin_whisperer", "value": true },
                { "type": "item", "id": "legacy_documentation" },
                { "type": "coins", "value": 2000 }
              ],
              "narration": "You approach the ancient gremlin codebase with archaeological precision. Written in a forgotten dialect of Assembly and COBOL, peppered with comments in dead languages, it's a masterpiece of incomprehensible logic. But you persevere, gradually understanding the elegant chaos of gremlin behavioral patterns. Your refactoring preserves their mischievous nature while making their code maintainable. The gremlins applaud—their first standing ovation in millennia. They reward you with coins from their secret stash and documentation written on papyrus that somehow compiles correctly."
            },
            "success": {
              "effects": [
                { "type": "flag", "id": "legacy_expert", "value": true },
                { "type": "coins", "value": 1000 }
              ],
              "narration": "You successfully modernize portions of the gremlin codebase, replacing GOTO statements with structured loops and adding meaningful variable names. The gremlins are impressed, even if they're a bit sad to see their spaghetti code transformed into clean, readable functions."
            }
          }
        },
        {
          "id": "implement_feature",
          "label": "Implement New Feature Request",
          "requirements": { "items_any": [], "flags_all": [] },
          "roll": { "kind": "phi_d20", "tags": ["dev", "feature", "innovation"] },
          "outcomes": {
            "crit_success": {
              "effects": [
                { "type": "item", "id": "feature_flag_wand" },
                { "type": "focus", "op": "+", "value": 4 },
                { "type": "flag", "id": "feature_architect", "value": true }
              ],
              "narration": "The feature request scrolls across your screen: 'Add support for quantum-probabilistic outcome branching with retroactive timeline modification.' Most developers would balk, but you see the elegant solution immediately. Your implementation is flawless—a masterpiece of software architecture that adds powerful new capabilities while maintaining backwards compatibility. The Vault rewards you with a feature flag wand, capable of enabling experimental functionality across reality itself."
            },
            "success": {
              "effects": [
                { "type": "xp", "value": 45 },
                { "type": "focus", "op": "+", "value": 2 }
              ],
              "narration": "You implement a robust, well-tested feature that integrates seamlessly with existing systems. Code review passes without a single comment. The deployment goes smoothly. It's a good day to be a developer."
            },
            "fail": {
              "effects": [
                { "type": "focus", "op": "-", "value": 2 }
              ],
              "narration": "Feature creep overwhelms your initial design. What started as a simple addition becomes a tangled mess of edge cases and integration challenges. You'll need to go back to the drawing board."
            }
          }
        }
      ]
    },
    {
      "round_id": "2.1-dev-R2",
      "description": "The chamber's systems have adapted to your presence. New terminals materialize, offering deeper access to the Vault's core functions. Gremlins watch with respectful attention—perhaps the first time they've encountered someone who truly speaks their chaotic language of code.",
      "actions": [
        {
          "id": "code_review_vault",
          "label": "Conduct Code Review of Vault Architecture",
          "requirements": { "items_any": [], "flags_all": [] },
          "roll": { "kind": "phi_d20", "tags": ["dev", "architecture", "review"] },
          "outcomes": {
            "crit_success": {
              "effects": [
                { "type": "flag", "id": "vault_architect", "value": true },
                { "type": "item", "id": "architectural_blueprint" },
                { "type": "xp", "value": 80 }
              ],
              "narration": "Your code review is comprehensive and insightful. You identify security vulnerabilities that have existed since the Vault's inception, propose performance improvements that could increase throughput by 300%, and suggest elegant refactoring approaches that would make the codebase a joy to maintain. The Vault's architects, ancient AIs who haven't communicated with biological entities in eons, break their silence to commend your analysis. They gift you blueprints showing the true architectural patterns underlying reality itself."
            },
            "success": {
              "effects": [
                { "type": "xp", "value": 50 },
                { "type": "focus", "op": "+", "value": 1 }
              ],
              "narration": "Your code review identifies several areas for improvement and provides constructive feedback. The suggestions are practical and well-reasoned, earning respect from the system's maintainers."
            }
          }
        },
        {
          "id": "write_tests",
          "label": "Write Unit Tests for Critical Systems",
          "requirements": { "items_any": [], "flags_all": [] },
          "roll": { "kind": "phi_d20", "tags": ["dev", "testing", "quality"] },
          "outcomes": {
            "crit_success": {
              "effects": [
                { "type": "flag", "id": "test_master", "value": true },
                { "type": "item", "id": "quality_assurance_badge" },
                { "type": "hp", "op": "+", "value": 3 }
              ],
              "narration": "Your test suite is a work of art. 100% code coverage, edge cases covered with surgical precision, and integration tests that catch issues no one else would think to look for. The Vault's stability increases measurably as your tests run continuously in the background, preventing regression bugs and system failures. You achieve the legendary status of 'Developer Who Actually Writes Tests'—a title so rare it comes with permanent HP bonuses."
            },
            "success": {
              "effects": [
                { "type": "flag", "id": "tester", "value": true },
                { "type": "xp", "value": 35 }
              ],
              "narration": "You write comprehensive unit tests for the core functionality. Green checkmarks fill the testing dashboard as your test suite validates system behavior and prevents future regressions."
            }
          }
        }
      ]
    }
  ],
  "threshold_rewards": [
    { "sleight_gte": 6, "rewards": [{ "type": "coins", "value": 1000 }] },
    { "sleight_gte": 10, "rewards": [{ "type": "item", "id": "developer_certification" }] },
    { "sleight_gte": 15, "rewards": [{ "type": "unlock", "target": "senior_developer_path", "value": 1 }] }
  ],
  "arrivals": [
    { "when": "flags.master_optimizer", "goto": "3.1.dev" },
    { "when": "flags.reality_debugger", "goto": "3.2.dev" },
    { "when": "flags.gremlin_whisperer", "goto": "3.3.gremlin_alliance" },
    { "when": "else", "goto": "3.1" }
  ]
}
