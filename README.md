# SAP Order-to-Cash Graph Query System

A full-stack graph-based data modeling and query system that unifies fragmented SAP Order-to-Cash business data into an interactive knowledge graph, powered by an LLM conversational interface. Users can visually explore 21,000+ interconnected business entities and ask natural language questions that are dynamically translated into structured database queries, returning data-backed answers grounded entirely in the dataset.

---

## Architecture

```
┌──────────────────────────┐              ┌─────────────────────────────────┐
│    Next.js 16 Frontend   │    HTTP /    │       FastAPI Backend           │
│                          │     SSE      │       (Python 3.12, async)      │
│  ┌────────┐  ┌────────┐  │◄────────────►│                                 │
│  │ Graph  │  │  Chat  │  │              │  ┌───────────┐  ┌────────────┐  │
│  │ Viewer │  │ Panel  │  │              │  │ Graph API │  │ LangChain  │  │
│  │(force- │  │(stream │  │              │  │ (nodes,   │  │ ReAct Agent│  │
│  │ graph) │  │  +md)  │  │              │  │  edges,   │  │ (GPT-5.4 + │  │
│  └────────┘  └────────┘  │              │  │  search)  │  │  6 tools)  │  │
└──────────────────────────┘              │  └─────┬─────┘  └─────┬──────┘  │
                                          │        │              │         │
                                          │     ┌──▼──────────────▼───┐     │
                                          │     │    MongoDB Atlas    │     │
                                          │     │  (19 raw collections│     │
                                          │     │  + nodes + edges)   │     │
                                          │     └─────────────────────┘     │
                                          └─────────────────────────────────┘
```

### How It Works

1. **Data Ingestion**: 19 JSONL entity files are loaded into MongoDB collections (21,393 records total)
2. **Graph Construction**: A property graph is built from the relational data — each entity instance becomes a node, each FK relationship becomes a directed edge (21,393 nodes, 8,562 edges, 24 relationship types)
3. **Visualization**: The graph is rendered as an Obsidian-style interactive force-directed layout where users can click nodes to inspect, show connections, pan/zoom, and explore relationships
4. **Conversational Queries**: Users ask natural language questions in a resizable chat panel. A LangChain ReAct agent (using `create_agent`) translates these into MongoDB queries, executes them, and returns data-backed answers with full transparency into what data was used
5. **Graph-Chat Sync**: When the AI agent references specific entities in its answer, those nodes are automatically highlighted with animated amber glows and the camera zooms to them. Users can click referenced node badges in the chat to jump directly to that node on the graph
6. **Clarifying Questions**: When a query is ambiguous or lacks context, the system asks follow-up questions instead of guessing — ensuring every answer is accurate

---

## Key Architectural Decisions

### 1. Database: MongoDB Atlas (Document Store as Property Graph)

I chose MongoDB as a unified store for both raw entity data and the graph representation, rather than using a dedicated graph database like Neo4j. This decision is justified because:

- **Dataset scale**: At ~21K records, MongoDB handles both document queries and graph traversal efficiently — no need for a specialized graph engine
- **Dual storage model**: Raw entity data lives in 19 typed collections (for analytical queries), while the graph lives in separate `nodes` and `edges` collections (for visualization and traversal). This separation allows the AI agent to run complex aggregation pipelines on raw data while the frontend queries the graph structure independently
- **Simplified infrastructure**: One database for everything reduces deployment complexity, operational overhead, and latency
- **Aggregation framework**: MongoDB's aggregation pipelines are powerful enough to handle the analytics queries the AI agent generates (GROUP BY, JOINs via $lookup, COUNT, SUM, etc.)

### 2. LLM: GPT-5.4 with LangChain ReAct Agent

I use OpenAI's GPT-5.4 (March 2026) as the reasoning engine, orchestrated through LangChain's `create_agent` (ReAct pattern):

- **Tool-calling accuracy**: GPT-5.4 has state-of-the-art structured function calling, which is critical because the agent must correctly select from 6 different tools, construct valid MongoDB queries, and interpret results — with zero tolerance for hallucinated arguments
- **ReAct pattern**: The agent iteratively reasons about what data it needs, calls a tool, inspects the result, and decides whether to call another tool or formulate the final answer. This multi-step reasoning is essential for complex queries like "trace the full O2C flow" which requires chaining 4-5 database lookups
- **Clarifying questions**: The agent is instructed to ask follow-up questions when a query is ambiguous, incomplete, or could be interpreted multiple ways — rather than guessing and risking an incorrect answer
- **Retry with exponential backoff**: If an LLM call fails, the system retries up to 3 times with exponential backoff (1s, 2s delays), streaming status updates to the user during retries
- **6 specialized tools**: `query_collection` (arbitrary MongoDB queries), `trace_order` (O2C flow tracing), `trace_billing` (reverse flow tracing), `find_broken_flows` (integrity analysis), `get_graph_neighbors` (graph traversal), `search_entities` (entity lookup)

### 3. Graph Visualization: react-force-graph-2d with Obsidian-Style Design

I chose `react-force-graph-2d` (d3-force based) for its canvas rendering performance and customizability:

- **Lazy loading**: The initial graph load sends ~1,634 core O2C nodes (sales orders, deliveries, billings, journal entries, payments, customers, products, plants). The 16,723 product_storage_locations and 3,036 product_plants are excluded to keep the visualization performant
- **Obsidian-inspired aesthetics**: Deep dark background (#0A0A0F), soft glowing nodes with type-specific premium color palette, animated pulsing halos on highlighted nodes, labels that appear on hover with frosted-glass backgrounds
- **Graph-Chat integration**: When the AI agent's answer references entities, those nodes are highlighted with animated amber glows and the camera automatically zooms and centers on them. Clicking node badges in chat responses jumps directly to that node with fuzzy ID matching for compound keys
- **Mac trackpad native**: Two-finger scroll pans the graph (like Maps/Figma), pinch zooms — matching native macOS gesture behavior
- **Show/Hide Connections**: Click any node to inspect its metadata, then use "Show Connections" to light up all directly connected entities and edges. "Hide Connections" clears the highlights. Works from any node in the lit path
- **Click outside to deselect**: Clicking empty space on the graph closes the detail panel and clears all highlights

---

## LLM Prompting Strategy

The system prompt is the most critical component for answer quality. It provides:

1. **Complete schema context**: All 19 collection names, their fields, primary keys, and data types. The LLM knows exactly what data is available and how to query it
2. **Explicit relationship mapping**: Every FK relationship is documented, especially the non-obvious payment linking chain:
   ```
   billing.accountingDocument → JE.accountingDocument (NOT via invoiceReference, which is NULL)
   JE.clearingAccountingDocument → payment.accountingDocument
   ```
   This domain-specific insight was discovered during data exploration and is critical for correct flow tracing
3. **Tool selection guidance**: The prompt instructs the LLM when to use which tool — `trace_order` for flow questions, `query_collection` with aggregation for analytics, `find_broken_flows` for integrity checks
4. **Strict grounding rules**: "NEVER fabricate data or document numbers. ALWAYS use tools to query actual data. Always cite specific document numbers in answers."
5. **Clarifying question protocol**: When a query is ambiguous (missing entity ID, unclear metric, vague reference without prior context), the agent asks specific follow-up questions with suggested options instead of guessing
6. **Conciseness rules**: "Say things ONCE. Never repeat the same point in different words. Structure with markdown but keep responses tight."

### Prompt Pipeline
```
User message
  ↓
[Guardrail check] → Layer 1 (keyword, <1ms) or Layer 2 (LLM) → Reject if off-topic
  ↓
[Context check] → Is the query ambiguous? → Ask clarifying follow-up question
  ↓
[ReAct loop]
  ├── LLM reasons about what data to query
  ├── Calls tool (e.g., query_collection with MongoDB aggregation)
  ├── Inspects result
  ├── Decides: need more data? → call another tool
  └── Formulates final answer grounded in query results
  ↓
Response + referenced_nodes + tools_used + query_used
```

---

## Guardrails

The guardrail system uses a **three-tier architecture** with conversation-aware logic:

### Tier 1: Hard Off-Topic (regex patterns, <1ms, ALWAYS blocked)
- 15+ regex patterns catching poems, stories, jokes, recipes, general knowledge, sports results, philosophy, homework, creative writing, translations
- These are blocked **even mid-conversation** — e.g., asking "write me a poem" after 5 valid data queries still gets rejected
- Examples: "write me a poem", "tell me a joke", "who won the world cup", "recipe for pasta", "meaning of life"

### Tier 2: Soft Off-Topic (keyword analysis, <1ms)
- Triggered when the query has no domain keywords and is very short (e.g., "hello", "what?")
- **First message**: blocked (no context to justify it)
- **Follow-up in conversation**: allowed (could be "yes", "do that", "the second one" — contextual references)

### Tier 3: LLM Classifier (ambiguous cases only)
- A short GPT call: "Is this question related to SAP Order-to-Cash business data? YES/NO"
- Only invoked for first messages where the keyword filter is uncertain (~10-15% of queries)
- Follow-ups with history bypass this check entirely for speed

### Conversation-Aware Guardrailing
The guardrail strategy adapts based on whether the user has an active conversation:

| Scenario | Hard off-topic (regex) | Soft off-topic (no keywords) | Uncertain |
|----------|----------------------|------------------------------|-----------|
| **First message** | BLOCKED | BLOCKED | LLM decides |
| **Follow-up (has history)** | BLOCKED | ALLOWED (contextual) | ALLOWED (contextual) |

This ensures:
- Poems, jokes, recipes are **always blocked** regardless of conversation state
- Vague follow-ups like "do the second one", "yes please", "show me more" are **allowed** when there's prior context
- The system never answers general knowledge questions even mid-conversation

### Verified blocked queries (tested both as first message AND mid-conversation):
- "Write me a poem about love" → BLOCKED
- "Tell me a joke" → BLOCKED
- "Who won the world cup" → BLOCKED
- "Give me a recipe for pasta" → BLOCKED
- "What is the meaning of life" → BLOCKED
- "Help me with my homework" → BLOCKED

### Verified allowed follow-ups (mid-conversation with history):
- "do the second one" → ALLOWED (references prior suggestion)
- "yes please" → ALLOWED (confirmation)
- "show me their billing" → ALLOWED (on-topic follow-up)
- "now show me broken flows" → ALLOWED (back to domain topic)

---

## Features

### Core Features (Required)

| Feature | Implementation |
|---------|---------------|
| **Graph Construction** | 21,393 nodes across 19 entity types, 8,562 edges across 24 relationship types. Declarative schema registry drives both node/edge creation and relationship mapping |
| **Graph Visualization** | Interactive force-directed graph with click-to-inspect, show/hide connections, node metadata panel, relationship exploration. Color-coded by entity type with hover labels. Obsidian-style dark theme |
| **Conversational Queries** | LangChain ReAct agent with GPT-5.4, 6 specialized tools, streaming responses via SSE, conversation memory, clarifying questions |
| **Example Queries** | All 3 required queries verified: products by billing count, full flow tracing, broken flow detection. Plus 15 sample queries across 6 categories on the welcome screen |
| **Guardrails** | Three-tier system (hard regex + soft keyword + LLM classifier) with conversation-aware logic. Blocks off-topic queries even mid-conversation while allowing contextual follow-ups |

### Bonus Features (All Implemented)

| Feature | Implementation |
|---------|---------------|
| **NL to Query Translation** | Every answer includes an expandable "Analysis Pipeline" section showing step-by-step tool calls with parameters + the exact MongoDB query executed |
| **Node Highlighting** | Referenced entities in answers are automatically highlighted on the graph with animated amber glows. Camera auto-zooms and centers on them. Clickable node badges in chat jump to specific nodes |
| **Streaming Responses** | Real-time SSE streaming with token-by-token display. Animated processing indicator shows which tools are being called with bouncing dots. Status updates during retries |
| **Conversation Memory** | Per-session conversation history with TTL-based cleanup (1hr, max 100 sessions). Follow-up queries correctly resolve pronouns ("that order", "their billing documents", "was it delivered?") |
| **Advanced Graph Analysis** | Full O2C flow tracing (SO → Delivery → Billing → JE → Payment), broken flow detection with categorized issues, reverse tracing from billing documents back to sales orders |
| **Clarifying Questions** | System asks follow-up questions when queries are ambiguous instead of guessing. Evaluates context from conversation history before asking. Tested with 5 ambiguous query types |
| **Anti-Repetition** | LLM configured with `frequency_penalty: 0.3` + `presence_penalty: 0.2` + prompt rules to prevent duplicated paragraphs. Verified zero duplication across 10 diverse queries |

### UI/UX Features

| Feature | Description |
|---------|-------------|
| **Obsidian-style graph** | Deep void background (#0A0A0F), soft glowing nodes with premium color palette, animated pulsing halos on highlighted nodes, labels on hover with frosted-glass pill backgrounds, prominent blue-gray edges with amber highlight mode, white glow selection ring |
| **Premium dark theme** | Indigo/purple accent colors, subtle borders at 30-40% opacity, backdrop-blur panels, custom thin translucent scrollbar |
| **Resizable chat panel** | Drag the left edge of the chat panel to resize it. Min 280px, max 60% of screen width |
| **Collapsible chat** | "Hide Chat" / "Open Chat" toggle button in the header gives full-screen graph mode |
| **New Chat session** | "New Chat" button in chat header clears messages and conversation memory without page reload |
| **Show/Hide Connections** | Click any node → detail panel shows all properties + "Show Connections" button lights up all directly connected nodes/edges. "Hide Connections" clears only that node's highlights. Works from any node in the lit path |
| **Click outside to deselect** | Clicking empty space closes the detail panel and clears highlights |
| **Selected node indicator** | Clicked node gets a prominent white ring + outer halo + always-visible label so it stands out from the 1,600+ other nodes |
| **Mac trackpad gestures** | Two-finger scroll = pan (like Maps), pinch = zoom. No accidental zoom-on-scroll |
| **Animated processing state** | When the AI is querying tools, an animated pipeline shows each step with tool name + bouncing dots |
| **Structured grounding display** | Expandable section under each answer showing: Analysis Pipeline (visual timeline), Query Executed (MongoDB query), Graph Nodes Referenced (clickable amber badges) |
| **Clickable node badges** | Referenced entities in answers shown as amber badges — clicking one highlights, selects, and zooms to that node on the graph. Fuzzy matching for compound IDs (journals, payments) |
| **15 sample queries in 6 categories** | Welcome screen with clickable queries organized as: Flow Tracing, Analytics & Rankings, Flow Integrity & Anomalies, Deep Exploration, Conversation Memory (two-step demo), Guardrails (off-topic demo). Each demonstrates a different system capability |
| **Markdown rendering with tables** | AI responses render with proper GFM tables (via remark-gfm), bold, lists, code blocks, headings. Tables have hover-row highlighting and styled headers |
| **Retry mechanism** | Failed LLM calls retry 3 times with exponential backoff (1s, 2s). User sees "Retrying..." status in the chat bubble. Failed messages show an amber "Retry" button |
| **New Chat button** | "New Chat" in the chat header clears all messages, resets conversation memory, clears graph highlights — no page reload needed |
| **Multi-line input** | Chat input is a textarea that auto-grows. Enter sends, Shift+Enter adds new line. Hint text shown below |
| **Active node badge highlighting** | When a referenced node badge is clicked in chat, it gets a bright amber ring to show which one is selected. Deselects when clicking elsewhere on the graph or a different badge |
| **Auto-select first referenced node** | When an answer arrives with referenced nodes, the first one is auto-selected — its badge highlights, graph zooms to it, detail panel opens |
| **Fuzzy node ID matching** | Clicking node badges with compound IDs (like journal entries: `journal::ABCD-2025-9400635858`) correctly finds and zooms to the node even when the badge only shows the partial ID |
| **Smooth exit animations** | Node detail panel fades out with a slide-up animation on deselect (200ms ease-out), matching the enter animation |
| **Smooth scrolling** | `scroll-behavior: smooth` + `-webkit-overflow-scrolling: touch` globally. Custom thin translucent 6px scrollbar on both axes with transparent corner piece |
| **Smooth animations** | fadeIn, slideUp, pulse, glow CSS animations throughout. Cursor pointer on all interactive elements |
| **Selected node white glow** | Selected nodes get a double white glow ring (matching the "Selected" legend indicator) so they stand out clearly from highlighted amber nodes |
| **Human-friendly data formatting** | Dates show as "2 Apr 2025" instead of ISO timestamps. Times show as "05:02:26" instead of JSON objects. Booleans show as "Yes"/"No" |
| **Resizable node detail panel** | Drag the right edge of the node detail panel to resize (260px–500px). Scrollable both horizontally and vertically with proper padding from scrollbars |
| **Collapsible node badge list** | When answers reference 15+ nodes, extra badges collapse with "Show N more" / "Show less" toggle instead of being hidden |
| **Prominent graph edges** | Normal edges rendered at 0.8px width with 30% blue-gray opacity — clearly visible but not distracting. Highlighted edges at 2px amber |
| **Category descriptions** | Each sample query category on the welcome screen has a subtitle describing what the user will see, guiding non-technical users |
| **Brighter text readability** | All chat panel text uses zinc-300/400 (brighter shades) with increased font sizes for easy reading on dark backgrounds |
| **Error states** | Graph loading error with retry button, chat error handling, connection failure states |

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Backend | Python, FastAPI, Motor (async MongoDB driver) | 3.12, 0.135, 3.7 |
| AI/ML | LangChain (`create_agent` from `langchain.agents`), OpenAI GPT-5.4 (primary) + GPT-5.4-mini (fallback) | 1.2, latest |
| Database | MongoDB Atlas | 7.x |
| Frontend | Next.js, React, TypeScript | 16.2, 19, 5.x |
| Styling | Tailwind CSS v4, shadcn/ui, @tailwindcss/typography | 4.x, latest |
| Graph | react-force-graph-2d (d3-force) | latest |
| Markdown | react-markdown, remark-gfm | latest |
| DevOps | Docker, Docker Compose | latest |

---

## Data Model

### Entity Types (19 Collections, 21,393 Records)

**Core O2C Flow (10 collections):**
| Collection | Records | Primary Key | Description |
|-----------|---------|-------------|-------------|
| `sales_order_headers` | 100 | salesOrder | Sales order master data |
| `sales_order_items` | 167 | salesOrder + salesOrderItem | Line items within orders |
| `sales_order_schedule_lines` | 179 | salesOrder + salesOrderItem + scheduleLine | Delivery scheduling |
| `outbound_delivery_headers` | 86 | deliveryDocument | Outbound delivery documents |
| `outbound_delivery_items` | 137 | deliveryDocument + deliveryDocumentItem | Delivery line items |
| `billing_document_headers` | 163 | billingDocument | Invoice/billing documents |
| `billing_document_items` | 245 | billingDocument + billingDocumentItem | Billing line items |
| `billing_document_cancellations` | 80 | billingDocument | Cancelled billing documents |
| `journal_entry_items_accounts_receivable` | 123 | companyCode + fiscalYear + accountingDocument | AR journal entries |
| `payments_accounts_receivable` | 120 | companyCode + fiscalYear + accountingDocument | Payment clearing documents |

**Master Data (9 collections):**
| Collection | Records | Description |
|-----------|---------|-------------|
| `business_partners` | 8 | Customer master data |
| `business_partner_addresses` | 8 | Customer addresses |
| `customer_company_assignments` | 8 | Company code assignments |
| `customer_sales_area_assignments` | 28 | Sales area configurations |
| `products` | 69 | Product master data |
| `product_descriptions` | 69 | Product text descriptions |
| `product_plants` | 3,036 | Product-plant assignments |
| `product_storage_locations` | 16,723 | Storage location data |
| `plants` | 44 | Plant/warehouse master data |

### Graph Model (21,393 Nodes, 8,562 Edges)

**Node ID format**: `{entity_type}::{primary_key}` (e.g., `sales_order::740506`)

**24 Relationship Types:**
```
Core O2C Chain:
  HAS_ITEM          : Sales Order → Order Item
  HAS_SCHEDULE      : Order Item → Schedule Line
  ORDERED_BY        : Sales Order → Customer
  CONTAINS_PRODUCT  : Order Item → Product
  PRODUCED_AT       : Order Item → Plant
  HAS_DEL_ITEM      : Delivery → Delivery Item
  DELIVERS_ORDER    : Delivery Item → Sales Order
  SHIPPED_FROM      : Delivery Item → Plant
  HAS_BILL_ITEM     : Billing → Billing Item
  BILLS_DELIVERY    : Billing Item → Delivery
  BILLS_PRODUCT     : Billing Item → Product
  BILLED_TO         : Billing → Customer
  GENERATES_JE      : Billing → Journal Entry
  CANCELS           : Cancellation → Billing
  JE_FOR_CUSTOMER   : Journal Entry → Customer
  CLEARED_BY        : Journal Entry → Payment
  PAID_BY           : Payment → Customer

Master Data:
  HAS_ADDRESS             : Customer → Address
  HAS_COMPANY_ASSIGNMENT  : Customer → Company Assignment
  HAS_SALES_AREA          : Customer → Sales Area
  DESCRIBED_AS            : Product → Description
  AVAILABLE_AT            : Product → Product Plant
  LOCATED_AT              : Product Plant → Plant
  HAS_STORAGE             : Product Plant → Storage Location
```

### Critical Data Insight: Payment Linking

In this dataset, `payments_accounts_receivable.invoiceReference` is **NULL for all 120 records**. The conventional SAP FK from payment to billing invoice does not exist. Instead, payments connect to billings through journal entries:

```
Billing Document ──(accountingDocument)──► Journal Entry ──(clearingAccountingDocument)──► Payment
```

This non-obvious linking chain was discovered during data exploration and is explicitly documented in the LLM's system prompt to ensure correct flow tracing.

---

## Setup

### Prerequisites
- Python 3.12+
- Node.js 18+
- MongoDB Atlas account (or local MongoDB)
- OpenAI API key

### Backend Setup

```bash
cd src/backend
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
pip install -r requirements.txt
```

Create `.env` in the project root:
```env
OPENAI_API_KEY=your-openai-api-key
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/dbname
```

Start the server (auto-ingests data on first run):
```bash
cd src/backend
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

The first startup will automatically:
1. Load all 19 JSONL files into MongoDB (21,393 documents)
2. Build the graph (21,393 nodes, 8,562 edges)
3. Create database indexes for query performance

### Frontend Setup

```bash
cd src/frontend
npm install
npm run dev
```

Open http://localhost:3000

Set the backend URL via environment variable if needed:
```bash
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

### Docker

```bash
docker compose up --build
```

The Docker setup runs the backend with the dataset mounted. MongoDB Atlas is used as the database (configured via the `.env` file).

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check — returns node/edge counts |
| `GET` | `/api/graph/initial` | Initial graph load (1,634 core nodes, excludes large collections) |
| `GET` | `/api/graph/neighbors/{node_id}` | 1-hop neighbors of a node |
| `GET` | `/api/graph/node/{node_id}` | Full node metadata including all raw document properties |
| `GET` | `/api/graph/search?q=...&type=...` | Search nodes by label or ID substring |
| `GET` | `/api/graph/stats` | Graph statistics (counts by type) |
| `POST` | `/api/chat` | Natural language query — returns answer + tools_used + query_used + referenced_nodes |
| `POST` | `/api/chat/stream` | SSE streaming — emits tool_start, token, tool_end, status, done events |
| `POST` | `/api/ingest` | Re-trigger data ingestion and graph rebuild |

### Chat Response Schema
```json
{
  "response": "There are 100 sales orders...",
  "referenced_nodes": ["sales_order::740506", "product::S8907367008620"],
  "conversation_id": "uuid-here",
  "tools_used": [
    {"tool_name": "query_collection", "tool_input": {"collection": "sales_order_headers", "aggregation": [...]}}
  ],
  "query_used": "db.sales_order_headers.aggregate([{\"$count\": \"total\"}])"
}
```

### SSE Stream Events
```
data: {"type": "tool_start", "content": "query_collection", "tool_input": {...}}
data: {"type": "tool_end", "content": "Tool completed"}
data: {"type": "token", "content": "There"}
data: {"type": "token", "content": " are"}
data: {"type": "status", "content": "Request failed, retrying in 2s... (attempt 2/3)"}
...
data: {"type": "done", "content": "...", "tools_used": [...], "query_used": "...", "referenced_nodes": [...]}
```

---

## Example Queries & Verified Results

### Required Queries (from assignment)

**1. "Which products are associated with the highest number of billing documents?"**
```
Result: Top products ranked by distinct billing document count:
1. S8907367008620 (FACESERUM 30ML VIT C) — 22 billing documents
2. S8907367039280 (SUNSCREEN GEL SPF50-PA+++ 50ML) — 22 billing documents
3. S8907367042006 (Destiny 100ml EDP) — 16 billing documents
Tools used: query_collection (aggregation on billing_document_items grouped by material)
Graph: Product nodes highlighted with amber glow + auto-zoom
```

**2. "Trace the full flow of sales order 740506"**
```
Result: Complete O2C chain:
  SO 740506 → 5 items → Delivery 80737721 → Billing docs → Journal entries → Payments
  Full chain with all document numbers, amounts, dates, statuses
Tools used: trace_order
Graph: Sales order, delivery, billing nodes highlighted + auto-zoom
```

**3. "Identify sales orders with broken or incomplete flows"**
```
Result: 44 sales orders with issues:
  - 3 with no billing (delivered but not billed)
  - 4 with no journal entry (billed but no JE)
  - 37 with no payment (JE exists but no clearing)
Tools used: find_broken_flows
```

### Data Accuracy Verification (cross-checked against MongoDB)

| Query | AI Answer | Database Value | Match |
|-------|-----------|---------------|-------|
| Billing cancellations count | 80 | 80 | Exact |
| SO 740509 net amount | 229.66 INR | 229.66 | Exact |
| Unique products | 69 | 69 | Exact |
| Plant count | 44 | 44 | Exact |
| Customer count | 8 | 8 | Exact |

### Conversation Memory Test (3-turn)
```
Turn 1: "Tell me about sales order 740509"
  → Returns full SO details (amount: 229.66, customer: 310000109, type: OR)

Turn 2: "What products are in that order?"
  → Correctly resolves "that order" → SO 740509 → LIPBALM 4G LIGHTNING VIT E

Turn 3: "Was it delivered?"
  → Correctly resolves "it" → SO 740509 → Delivery 80738040, qty 1 PC
```

### Clarifying Question Behavior
```
"Show me the billing details"        → Asks: which billing document number?
"Trace the flow"                     → Asks: which sales order or billing document?
"Compare the orders"                 → Asks: which orders? by what metric?
"What happened to that order?"       → Asks: which order? (no prior context)
"Show me the sales for last 2 months" → Asks: sales orders, billed revenue, or payments?
```

### Guardrail Test (first message AND mid-conversation)
```
"Write me a poem about love"    → BLOCKED (even mid-conversation)
"Tell me a joke"                → BLOCKED (even mid-conversation)
"Who won the world cup"         → BLOCKED (even mid-conversation)
"Give me a recipe for pasta"    → BLOCKED (even mid-conversation)
"What is the meaning of life"   → BLOCKED (even mid-conversation)
"Help me with my homework"      → BLOCKED (even mid-conversation)
```

### Contextual Follow-ups Test (mid-conversation, correctly ALLOWED)
```
"do the second one"             → ALLOWED (references prior suggestion)
"yes please"                    → ALLOWED (confirmation)
"show me their billing"         → ALLOWED (on-topic follow-up)
"now show me broken flows"      → ALLOWED (back to domain topic)
```

---

## Project Structure

```
/
├── src/
│   ├── backend/
│   │   ├── app/
│   │   │   ├── main.py                          # FastAPI app, CORS, lifespan (auto-ingest)
│   │   │   ├── config.py                        # Settings (env vars, paths, Docker-aware)
│   │   │   ├── models/                          # Pydantic schemas
│   │   │   │   ├── node.py, edge.py, graph.py   # Graph data models
│   │   │   │   └── chat.py                      # Chat request/response + tool call metadata
│   │   │   ├── db/
│   │   │   │   ├── mongodb.py                   # Motor async client (with certifi SSL)
│   │   │   │   └── indexes.py                   # Index definitions for all 21 collections
│   │   │   ├── ingestion/
│   │   │   │   ├── schema_registry.py           # Entity defs, PKs, FKs, colors (cornerstone)
│   │   │   │   ├── ingest.py                    # JSONL → MongoDB batch loader
│   │   │   │   └── graph_builder.py             # Builds nodes + edges from registry
│   │   │   ├── services/
│   │   │   │   ├── graph_service.py             # Graph queries (initial, neighbors, detail, search)
│   │   │   │   └── flow_tracer.py               # O2C flow tracing + broken flow detection
│   │   │   ├── agent/
│   │   │   │   ├── graph_agent.py               # LangChain create_agent + retry logic
│   │   │   │   ├── tools.py                     # 6 MongoDB query tools
│   │   │   │   ├── prompts.py                   # System prompt + guardrail + clarification rules
│   │   │   │   └── guardrails.py                # Two-layer off-topic detection
│   │   │   └── routers/
│   │   │       ├── graph.py                     # /api/graph/* endpoints
│   │   │       └── chat.py                      # /api/chat + /api/chat/stream (SSE)
│   │   ├── requirements.txt
│   │   └── Dockerfile
│   │
│   └── frontend/
│       ├── src/
│       │   ├── app/
│       │   │   ├── page.tsx                     # Main split layout (graph + resizable chat)
│       │   │   ├── layout.tsx                   # Root layout with dark theme
│       │   │   └── globals.css                  # Animations, scrollbar, theme vars
│       │   ├── components/
│       │   │   ├── graph/
│       │   │   │   ├── GraphViewer.tsx           # Obsidian-style force-graph + pan/zoom/select
│       │   │   │   ├── NodeDetail.tsx            # Metadata panel + show/hide connections
│       │   │   │   └── GraphControls.tsx         # Legend + stats overlay
│       │   │   └── chat/
│       │   │       ├── ChatPanel.tsx             # Chat with 15 sample queries + new chat
│       │   │       ├── MessageBubble.tsx         # Rich message + pipeline + grounding + retry
│       │   │       └── ChatInput.tsx             # Input with loading state
│       │   ├── hooks/
│       │   │   ├── useGraph.ts                  # Graph state + show/hide connections
│       │   │   └── useChat.ts                   # Chat state + SSE streaming + clear
│       │   └── lib/
│       │       ├── api.ts                       # API client with stream reader cleanup
│       │       └── types.ts                     # TypeScript interfaces
│       └── package.json
│
├── dataset/                                     # 19 entity folders with JSONL files
├── sessions/                                    # AI coding session logs (Claude Code)
├── docker-compose.yml
├── .gitignore
└── README.md
```

---

## Reliability & Error Handling

### Automatic Model Fallback with User Notification

The system uses a **primary/fallback model architecture** to ensure availability:

| Model | Role | When Used |
|-------|------|-----------|
| **GPT-5.4** | Primary | Default — best performance for complex tool-calling and reasoning |
| **GPT-5.4-mini** | Fallback | Only when primary hits rate limits (429 errors) |

**Fallback flow:**
1. Primary model returns 429 (rate limit) → system immediately switches to GPT-5.4-mini
2. User sees: *"The primary model (gpt-5.4) hit its rate limit. Switching to gpt-5.4-mini temporarily. Performance may be slightly reduced. Will switch back to the primary model in ~2 minutes."*
3. After 2 minutes, the system automatically attempts to use the primary model again on the next query
4. If primary is available → switches back, user sees: *"Switched back to primary model (gpt-5.4) for best performance."*
5. If primary is still rate-limited → stays on mini, extends the fallback timer, user is notified again

**Key design decisions:**
- **Only rate limits trigger the switch** — normal errors (timeouts, network issues) are retried with the same model using exponential backoff. The primary model is always preferred
- **User is always informed** — every model switch (to fallback or back to primary) appends a visible notice to the chat response so the user understands any performance changes
- **Seamless recovery** — the system probes the primary model automatically, no manual intervention needed
- **If auto-switch back fails, stays on current model** — no disruption to the user's session

### Error Handling Matrix

| Error Type | Action | User Sees |
|-----------|--------|-----------|
| **Rate limit (429) on primary** | Switch to mini, retry immediately | Model switch notice |
| **Rate limit (429) on mini** | Wait 5s, retry (up to 3 attempts) | "Retrying..." status |
| **Normal error on any model** | Retry with same model, exponential backoff (1s, 2s) | "Retrying..." status |
| **All 3 retries exhausted** | Show error message | Error + "Retry" button |
| **Guardrail LLM check fails** | Defaults to allowing the query (fails open) | No visible impact |
| **MongoDB query error** | Caught and returned as tool output | Agent interprets error |
| **Frontend stream disconnect** | ReadableStream reader released | No memory leak |
| **Backend unreachable** | Graph shows error state | Error + "Retry Connection" button |

### Additional Reliability Features

| Mechanism | Details |
|-----------|---------|
| **Retry Button** | Failed messages show an amber "Retry" button that resends the original question with one click |
| **Conversation TTL** | Idle sessions expire after 1 hour. Max 100 concurrent sessions to prevent memory leaks |
| **LLM timeout** | 120-second timeout per LLM API call to prevent hanging requests |
| **Tool query safety** | MongoDB queries wrapped in try/catch with 100-result limit to prevent runaway aggregations |

---

## Performance

- **Graph initial load**: ~1,634 nodes, 2,436 edges delivered in a single API call
- **Chat response time**: 10-50 seconds depending on query complexity (includes LLM reasoning + MongoDB queries)
- **SSE streaming**: Tokens stream in real-time with ~100ms latency per chunk
- **Data ingestion**: Full ingestion of 21,393 records + graph build completes in <30 seconds
- **MongoDB storage**: 3.6 MB used out of 512 MB free tier (0.7%)
- **Docker build**: ~15 seconds from cold build

---

## AI Coding Session

This project was built using **Claude Code** (Anthropic's CLI tool running Claude Opus 4.6). Session transcripts are available in the `/sessions` directory.

The development workflow involved:
1. **Dataset exploration**: Systematically reading all 19 JSONL entity types to understand schemas, primary keys, and foreign key relationships
2. **Relationship discovery**: Mapping 30+ FK relationships, discovering the non-obvious payment linking chain (billing → JE → payment via `clearingAccountingDocument`, NOT via `invoiceReference` which is NULL for all 120 records)
3. **Iterative development**: Building backend, frontend, and AI agent incrementally — schema registry first, then ingestion, then graph builder, then API, then agent, then frontend components
4. **Comprehensive testing**: 13 query accuracy tests, 8 FE flow tests, 5 data accuracy verifications against MongoDB, 3-turn conversation memory test, 10 guardrail scenarios (6 blocked + 4 contextual follow-ups)
5. **Multiple audit rounds**: Full backend + frontend code audit catching 20+ issues — streaming error handling, conversation memory leak, CORS security, TypeScript safety, React hook dependencies, stale closure bugs
6. **UX refinement through hands-on testing**: Each feature was tested by the user and refined based on real feedback:
   - Chat panel: collapsible → resizable drag handle → responsive width cap
   - Graph interaction: click-to-expand (caused simulation restart) → click-to-inspect + show/hide connections (no re-render)
   - Node deselection: library `onBackgroundClick` (unreliable) → native `pointerdown/pointerup` with distance check
   - Trackpad: default scroll-to-zoom → Mac-native two-finger pan + pinch zoom
   - Guardrails: two-layer (too aggressive on follow-ups) → three-tier conversation-aware (blocks poems mid-convo, allows "yes do that")
   - LLM output: duplicated paragraphs → frequency/presence penalties + prompt rules → zero duplication
   - Node badges: static → clickable with active state + fuzzy ID matching for compound keys
   - Detail panel: instant appear/disappear → smooth fadeIn/slideUp enter + fadeOut exit animation
   - Chat input: single-line input → auto-growing textarea with Shift+Enter for new lines
   - LLM reliability: single model → primary/fallback architecture with auto-switch on rate limits + user notifications + auto-recovery
   - Guardrail regex: false positive on "missing" (matched "sing") → fixed with `\b` word boundaries
   - Sample queries: generic placeholders → 15 curated queries across 6 categories with descriptions, each designed to showcase a specific capability
   - Text readability: dull zinc-600 text → brighter zinc-300/400 with larger font sizes for legibility
   - Node detail panel: fixed-width → resizable via drag handle + horizontal/vertical scrollbars + padding from scrollbar edges
   - Date/time display: raw ISO `2025-04-02T00:00:00.000Z` → human-friendly `2 Apr 2025`, JSON time objects → `05:02:26`, booleans → Yes/No
   - Selected node: white ring only → double white glow ring matching legend indicator, clearly distinct from amber highlighted nodes
   - Graph edges: barely visible `0.18` opacity → prominent `0.3` blue-gray at `0.8px` width, clearly showing the relationship network
   - Node badges: flat list with "+N more" text → collapsible dropdown with "Show N more" / "Show less" toggle
   - Scrolling: browser default → smooth scrolling globally with custom 6px translucent scrollbars on both axes
