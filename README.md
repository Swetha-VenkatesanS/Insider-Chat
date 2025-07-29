# Insider Chat – VS Code AI Assistant

Insider Chat is a personal VS Code extension that integrates an AI-powered assistant into your coding workflow. It supports both local and cloud-based LLMs and enhances interaction with your codebase using Retrieval-Augmented Generation (RAG) for context-aware responses.

---

## Features

- **Local + Cloud AI Integration**  
  Uses Ollama with DeepSeek-R1 (7B) locally and Gemini 2.5 Flash via cloud API for flexible LLM access.

- **Dynamic Toolset**  
  - Fix errors in the currently open file  
  - Run code directly from the VS Code editor  
  - Create new files in any language based on user prompts  
  - Detect system and language versions  

- **Workspace-Aware RAG Engine**  
  On activation, the extension reads and indexes your current workspace, making your project context available to both models for intelligent code discussions.

- **Seamless Editor Integration**  
  Built specifically for Visual Studio Code using the official Extension API.

---

## Components

This project includes the following core components:

- **VS Code Extension Panel:**  
  An AI chat interface built into VS Code, supporting local and cloud model switching.

- **Tooling System:**  
  Commands that interact with files, terminal, and the editor for smart actions triggered by the chat assistant.

- **RAG Context Engine:**  
  Loads and stores indexed content from the user’s workspace to provide personalized answers based on the actual codebase.

---

## Setup and Installation

### Prerequisites

- Node.js (v14 or higher recommended)  
- [Ollama](https://ollama.com/) installed with the DeepSeek-R1:7b model  
- Gemini API key (if using cloud model)

> Note: The extension does not operate fully offline due to model tool calls and some API-based operations.

---

### Installing the Extension

To run locally during development:

1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/swethasvinsiderchat.git
   cd swethasvinsiderchat

### Indexing Your Codebase
Automatic Scanning: Recursively scans all relevant files in your workspace, including .js, .ts, .py, .json, .md, and others
Chunking: Splits large files into smaller, manageable segments for more accurate embedding
Embeddings: Generates semantic vector embeddings using Hugging Face’s MiniLM model (all-MiniLM-L6-v2)
Vector Storage: Embeddings are stored and queried using Pinecone for fast and relevant retrieval during AI interactions

### Implementation Details
Local LLM: Runs Ollama locally with the DeepSeek-R1:7b model for fast, private code understanding
Embeddings Model: Uses Hugging Face’s all-MiniLM-L6-v2 model for generating dense code embeddings
Vector Database: Pinecone is used for indexing, storing, and retrieving code chunks in vector format
Tool Execution: All developer tools (like running files, fixing errors) are executed through the VS Code Extension API
Model Routing: Chat requests are dynamically routed to either DeepSeek or Gemini via custom wrappers based on the selected model

# License
This project is licensed under the MIT License.
See the LICENSE file for more information.

## Acknowledgments
Ollama – for local model hosting and execution
Hugging Face – for providing the MiniLM embeddings model
Pinecone – for managing vector similarity search and storage
Gemini – for cloud-based conversational AI integration
Visual Studio Code – for the extension development platform
