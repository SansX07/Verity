# Verity — AI-Powered Finance Reconciliation Controller

> An intelligent reconciliation system that helps finance teams automatically match settlement records with internal ledger data, identify discrepancies, explain exceptions, and learn from human corrections.

Built as a prototype for the **Razorpay Buildathon**.

---

## 🚀 The Problem

Payment reconciliation is often manual and time-consuming.

A business may receive settlement information from a payment platform while maintaining its own internal transaction ledger. These two datasets may not always match perfectly because of:

- Missing transactions
- Duplicate records
- Amount mismatches
- Settlement delays
- Date differences
- Processing fees
- Structural inconsistencies

Finance teams must manually investigate these discrepancies.

**Verity automates this process.**

---

# 💡 What is Verity?

Verity is an AI-assisted finance reconciliation system that:

1. Accepts settlement and ledger data
2. Matches related transactions
3. Detects reconciliation exceptions
4. Classifies discrepancies
5. Generates human-readable explanations
6. Allows analysts to resolve exceptions
7. Uses correction feedback to support model calibration
8. Provides a natural-language interface through **Ask Verity**

The goal is not simply to identify whether two records match.

Verity helps answer:

> **What went wrong, why did it happen, and what should the analyst investigate?**

---

# ✨ Key Features

## 🔄 Automated Reconciliation

Verity compares settlement records with internal ledger records and performs transaction matching.

The reconciliation pipeline identifies:

- Matched transactions
- Unmatched transactions
- Structural exceptions
- Potential discrepancies

---

## ⚠️ Exception Detection

The system detects and classifies reconciliation issues such as:

- Amount mismatches
- Missing ledger records
- Missing settlement records
- Duplicate transactions
- Date drift
- Other structural inconsistencies

---

## 🤖 Machine Learning Classification

Verity includes trained machine learning models for exception classification.

The project contains:

- **XGBoost classifier**
- **Logistic Regression baseline**
- Feature preprocessing
- Label encoding
- Model evaluation artifacts

The trained models are stored locally and used by the backend during inference.

---

## 🧠 Explainable Exceptions

Flagged exceptions are accompanied by explanations that help an analyst understand why a transaction was flagged.

Instead of only showing:

```text
Exception detected
