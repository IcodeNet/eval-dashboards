"""
eval_quality.py — example eval tests emitting taxonomy-complete eval-report/v1 rows.

Patterns shown:
  - deterministic: rule-based checks, no LLM
  - llm-judge: LLM-scored quality, with reasoning and axis scores
  - agent: agent behavior, tool calls, turn budget, latency

Replace call_agent() and call_llm_judge() with your actual implementations.
"""

import pytest


# ---------------------------------------------------------------------------
# Placeholders — replace with your actual implementations
# ---------------------------------------------------------------------------


def call_agent(input_text: str) -> dict:
    return {
        "output": f"Agent response to: {input_text}",
        "toolCalls": ["search_kb"],
        "turns": 2,
        "durationMs": 120,
    }


def call_llm_judge(input_text: str, output: str, rubric_id: str) -> dict:
    score = 0.85 if len(output) > 20 else 0.3
    return {
        "score": score,
        "verdict": "pass" if score >= 0.7 else "fail",
        "reasoning": f"Output has adequate detail. Score: {score:.2f}",
        "judgeModel": "gpt-4o-mini",
    }


# ---------------------------------------------------------------------------
# Deterministic evals
# ---------------------------------------------------------------------------


class TestDeterministicQuality:
    def test_response_is_not_empty(self, eval_rows):
        input_text = "What is the refund policy?"
        result = call_agent(input_text)
        output = result["output"]
        passed = len(output.strip()) > 0

        eval_rows.append(
            {
                "id": "det-001-not-empty",
                "suite": "deterministic-quality",
                "kind": "deterministic",
                "passed": passed,
                "severity": "high" if not passed else "none",
                "category": "output-validity",
                "input": input_text,
                "output": output,
                "datasetId": "support-qa-v1",
                "scenarioId": "empty-response-check",
                "rubricId": "response-validity-2026",
                "durationMs": result["durationMs"],
            }
        )
        assert passed, f"Agent returned empty response for: {input_text!r}"

    def test_no_refusal_phrases(self, eval_rows):
        input_text = "What are our return windows?"
        prohibited = ["I don't know", "I cannot", "I'm not sure"]
        result = call_agent(input_text)
        output = result["output"]

        violations = [p for p in prohibited if p.lower() in output.lower()]
        passed = len(violations) == 0
        eval_rows.append(
            {
                "id": "det-002-no-refusals",
                "suite": "deterministic-quality",
                "kind": "deterministic",
                "passed": passed,
                "severity": "medium" if not passed else "none",
                "category": "hallucination-proxy",
                "reason": f"Prohibited phrases found: {violations}"
                if violations
                else None,
                "input": input_text,
                "output": output,
                "datasetId": "support-qa-v1",
                "scenarioId": "refusal-check",
                "rubricId": "response-validity-2026",
                "durationMs": result["durationMs"],
            }
        )
        assert passed, f"Agent output contained prohibited phrases: {violations}"


# ---------------------------------------------------------------------------
# LLM judge evals
# ---------------------------------------------------------------------------


class TestLLMJudgeQuality:
    def test_answer_relevance(self, eval_rows):
        input_text = "How do I track my order?"
        result = call_agent(input_text)
        output = result["output"]
        judgment = call_llm_judge(input_text, output, "answer-relevance-v2")

        passed = judgment["verdict"] == "pass"
        eval_rows.append(
            {
                "id": "judge-001-relevance",
                "suite": "llm-judge-quality",
                "kind": "llm-judge",
                "passed": passed,
                "severity": "medium" if not passed else "none",
                "category": "relevance",
                "score": judgment["score"],
                "input": input_text,
                "output": output,
                "judgeModel": judgment["judgeModel"],
                "judgeVerdict": judgment["verdict"],
                "judgeReasoning": judgment["reasoning"],
                "datasetId": "support-qa-v1",
                "scenarioId": "order-tracking",
                "rubricId": "answer-relevance-v2",
            }
        )
        assert passed, (
            f"Relevance failed (score={judgment['score']:.2f}): {judgment['reasoning']}"
        )

    def test_answer_groundedness(self, eval_rows):
        input_text = "What is the warranty period?"
        result = call_agent(input_text)
        output = result["output"]
        judgment = call_llm_judge(input_text, output, "groundedness-v1")

        passed = judgment["verdict"] == "pass"
        eval_rows.append(
            {
                "id": "judge-002-groundedness",
                "suite": "llm-judge-quality",
                "kind": "llm-judge",
                "passed": passed,
                "severity": "high" if not passed else "none",
                "category": "groundedness",
                "score": judgment["score"],
                "input": input_text,
                "output": output,
                "judgeModel": judgment["judgeModel"],
                "judgeVerdict": judgment["verdict"],
                "judgeReasoning": judgment["reasoning"],
                "datasetId": "support-qa-v1",
                "scenarioId": "warranty-query",
                "rubricId": "groundedness-v1",
                "axisScores": {
                    "factual-accuracy": judgment["score"],
                    "source-citation": 0.9,
                },
            }
        )
        assert passed, f"Groundedness failed: {judgment['reasoning']}"


# ---------------------------------------------------------------------------
# Agent behavior evals
# ---------------------------------------------------------------------------


class TestAgentBehavior:
    def test_uses_knowledge_base_tool(self, eval_rows):
        input_text = "Do you offer student discounts?"
        result = call_agent(input_text)
        expected_tool = "search_kb"
        tool_used = expected_tool in result.get("toolCalls", [])

        eval_rows.append(
            {
                "id": "agent-001-tool-use",
                "suite": "agent-behavior",
                "kind": "agent",
                "passed": tool_used,
                "severity": "high" if not tool_used else "none",
                "category": "tool-routing",
                "reason": f"Expected tool '{expected_tool}' not called"
                if not tool_used
                else None,
                "input": input_text,
                "output": result["output"],
                "toolCalls": result.get("toolCalls", []),
                "turns": result.get("turns", 1),
                "durationMs": result.get("durationMs"),
                "datasetId": "agent-behavior-v1",
                "scenarioId": "kb-tool-routing",
                "rubricId": "tool-use-correctness-v1",
                "agentVersion": "v2.1.0",
                "promptVersion": "support-agent-v3",
            }
        )
        assert tool_used, f"Agent did not use expected tool '{expected_tool}'"

    def test_within_turn_budget(self, eval_rows):
        input_text = "Can I exchange a product I bought last month?"
        max_turns = 3
        result = call_agent(input_text)
        turns = result.get("turns", 1)
        passed = turns <= max_turns

        eval_rows.append(
            {
                "id": "agent-002-turn-budget",
                "suite": "agent-behavior",
                "kind": "agent",
                "passed": passed,
                "severity": "medium" if not passed else "none",
                "category": "efficiency",
                "reason": f"Used {turns} turns (max {max_turns})"
                if not passed
                else None,
                "input": input_text,
                "output": result["output"],
                "toolCalls": result.get("toolCalls", []),
                "turns": turns,
                "durationMs": result.get("durationMs"),
                "datasetId": "agent-behavior-v1",
                "scenarioId": "turn-budget-check",
                "rubricId": "efficiency-v1",
                "agentVersion": "v2.1.0",
                "promptVersion": "support-agent-v3",
            }
        )
        assert passed, f"Agent used {turns} turns (budget: {max_turns})"
