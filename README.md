# Verity — AI-Powered Finance Reconciliation Controller

> An AI-assisted reconciliation system that automatically matches settlement records with internal ledger data, detects discrepancies, explains exceptions, and learns from analyst corrections.

Built for the **Razorpay Buildathon**.

---

## 🚀 The Problem

Payment reconciliation is often manual, repetitive, and time-consuming.

Businesses must compare settlement data from payment platforms with their internal transaction ledgers. Differences can occur due to:

- Missing transactions
- Amount mismatches
- Duplicate records
- Settlement delays
- Date differences
- Processing fees
- Structural inconsistencies

Investigating these discrepancies manually can be slow and error-prone.

**Verity helps automate this process.**

---

## 💡 What is Verity?

Verity is an intelligent finance reconciliation controller that:

- 🔄 Matches settlement and ledger transactions
- ⚠️ Detects reconciliation exceptions
- 🤖 Classifies discrepancies using machine learning
- 🧠 Generates understandable explanations
- 👩‍💻 Allows analysts to resolve exceptions
- 📈 Uses analyst corrections for model calibration
- 💬 Supports natural-language queries through **Ask Verity**

Instead of simply saying:

> "Records do not match."

Verity helps answer:

> **What went wrong, why was it flagged, and what should the analyst investigate?**

---

## ✨ Key Features

### 🔄 Automated Reconciliation

Compares settlement records with internal ledger data and identifies:

- Matched transactions
- Unmatched transactions
- Potential discrepancies
- Structural exceptions

---

### ⚠️ Exception Detection

Verity identifies issues such as:

- Amount mismatches
- Missing ledger records
- Missing settlement records
- Duplicate transactions
- Date drift
- Structural inconsistencies

---

### 🤖 Machine Learning Classification

The project includes:

- XGBoost classifier
- Logistic Regression baseline
- Feature preprocessing
- Label encoding
- Model evaluation artifacts

Machine learning helps classify reconciliation exceptions based on transaction characteristics.

---

### 🧠 Explainable Exceptions

Exceptions are accompanied by human-readable explanations.

For example:

> **Amount Mismatch:** The settlement amount differs from the corresponding ledger amount beyond the configured tolerance.

This helps analysts understand **why a record was flagged**.

---

### 👩‍💻 Human-in-the-Loop Resolution

Analysts can review exceptions and provide corrections.

These corrections are used to support:

- Model calibration
- Feedback-driven improvement
- Better confidence estimation

The system is designed to assist analysts rather than blindly replace them.

---

### 💬 Ask Verity

**Ask Verity** provides a natural-language interface for querying reconciliation results.

Example questions:

- "Why was this transaction flagged?"
- "How many exceptions were detected?"
- "Show amount mismatches."
- "What should I investigate first?"

The system includes an AI-powered interface with a fallback mechanism for reliable responses.

---

## 🏗️ Architecture

```text
Settlement Data + Ledger Data
            │
            ▼
     Reconciliation Engine
            │
            ▼
      Transaction Matching
            │
            ▼
      Exception Detection
            │
            ▼
    ML Classification Layer
            │
            ▼
      Explanation Engine
            │
            ▼
       Analyst Review
            │
            ▼
     Feedback & Calibration
```

---

## 🛠️ Tech Stack

### Backend

* Python
* FastAPI
* XGBoost
* Scikit-learn
* Pandas

### Frontend

* React
* TypeScript
* Vite

### AI

* Gemini API integration
* Local fallback system

---

## 📊 Synthetic Data

The project uses **synthetic financial reconciliation data**.

This was intentionally designed to simulate realistic reconciliation scenarios while avoiding the use of real financial or customer data.

The datasets include scenarios such as:

* Clean transactions
* Missing records
* Amount mismatches
* Duplicate transactions
* Settlement inconsistencies
* Stress-test scenarios

Synthetic data allows the system to be tested safely and reproducibly.

---

## 📁 Project Structure

```text
verity/
│
├── backend_project/
│   ├── backend/
│   │   ├── main.py
│   │   ├── pipeline.py
│   │   ├── agent.py
│   │   ├── explanations.py
│   │   └── storage.py
│   │
│   ├── data/
│   ├── models/
│   ├── tests/
│   └── requirements.txt
│
├── frontend_project/
│   ├── src/
│   ├── package.json
│   └── vite.config.ts
│
├── ARCHITECTURE.md
├── FINANCE_CONTROLLER.md
└── README.md
```

---

# ⚙️ Running the Project

## 1️⃣ Clone the Repository

```bash
git clone https://github.com/SansX07/Verity.git
cd Verity
```

---

## 2️⃣ Start the Backend

```bash
cd backend_project
```

Create and activate a virtual environment:

```bash
python -m venv venv
```

### Windows

```bash
venv\Scripts\activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Start the server:

```bash
uvicorn backend.main:app --reload
```

The backend should start on:

```text
http://127.0.0.1:8000
```

---

## 3️⃣ Start the Frontend

Open another terminal:

```bash
cd frontend_project
```

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open the URL displayed in the terminal.

---

## 🔐 Environment Variables

If using Gemini-powered functionality, create:

```text
backend_project/backend/.env
```

Example:

```env
GEMINI_API_KEY=your_api_key_here
```

The application includes a fallback mechanism when the AI service is unavailable.

---

# 🧪 Testing

The project includes reconciliation datasets and stress-test scenarios.

To run available backend tests:

```bash
cd backend_project
pytest
```

---

# 🎯 Why Verity?

Most reconciliation systems focus on identifying whether records match.

**Verity goes further.**

It focuses on the full workflow:

```text
Detect
   ↓
Classify
   ↓
Explain
   ↓
Review
   ↓
Correct
   ↓
Improve
```

This makes Verity an **AI-assisted finance controller**, rather than just a transaction matching tool.

---

# 🔮 Future Improvements

Potential future enhancements include:

* Direct payment gateway integrations
* Real-time reconciliation
* Larger-scale transaction processing
* Advanced anomaly detection
* Continuous model retraining
* Role-based analyst workflows
* Production-grade authentication
* Expanded financial reporting

---

## 🏆 Razorpay Buildathon

Verity demonstrates how AI can assist finance and operations teams by making reconciliation:

* Faster
* More explainable
* Easier to investigate
* Human-in-the-loop
* Adaptable through feedback

---

## 👩‍💻 Built By

**Sanvi**

Built with the goal of exploring how **AI, machine learning, and intelligent automation** can improve financial reconciliation workflows.

---

## 📄 Additional Documentation

For more technical details:

* `ARCHITECTURE.md` — System architecture
* `FINANCE_CONTROLLER.md` — Finance controller concept

```