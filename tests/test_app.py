import json
import os
import unittest

from fastapi.testclient import TestClient

os.environ.setdefault("OPENAI_API_KEY", "test-api-key")

import app


class FakeOpenAICaller:
    """Deterministic replacement for call_openai_text inside tests."""

    def __init__(self):
        self.writer_sections = {
            "1. Introduction": (
                "### 1.1 Why governance matters\n"
                "Writer details for why governance matters.\n\n"
                "### 1.2 Key challenges\n"
                "Writer details on key challenges."
            ),
            "2. Core Principles": (
                "### 2.1 Data quality\n"
                "Writer notes on data quality.\n\n"
                "### 2.2 Access control\n"
                "Writer notes on access control.\n\n"
                "### 2.3 Compliance\n"
                "Writer notes on compliance."
            ),
        }
        self.translated_sections = {
            self.writer_sections["1. Introduction"]: (
                "### 1.1 Why governance matters\n"
                "Narration on why governance matters.\n\n"
                "### 1.2 Key challenges\n"
                "Narration covering key challenges."
            ),
            self.writer_sections["2. Core Principles"]: (
                "### 2.1 Data quality\n"
                "Narration about data quality.\n\n"
                "### 2.2 Access control\n"
                "Narration about access control.\n\n"
                "### 2.3 Compliance\n"
                "Narration about compliance."
            ),
        }

    def __call__(self, model_spec, system_prompt, user_prompt, style_hint=None):
        if system_prompt.startswith("You generate structured outlines"):
            payload = {
                "report_title": "Modern Data Governance for AI Teams",
                "sections": [
                    {
                        "title": "1. Introduction",
                        "subsections": [
                            "1.1 Why governance matters",
                            "1.2 Key challenges",
                        ],
                    },
                    {
                        "title": "2. Core Principles",
                        "subsections": [
                            "2.1 Data quality",
                            "2.2 Access control",
                            "2.3 Compliance",
                        ],
                    },
                ],
            }
            return json.dumps(payload)

        if system_prompt.startswith("You write high-quality"):
            if "Current section to write:\n1. Introduction" in user_prompt:
                return self.writer_sections["1. Introduction"]
            if "Current section to write:\n2. Core Principles" in user_prompt:
                return self.writer_sections["2. Core Principles"]
            raise AssertionError("Unexpected writer prompt")

        if system_prompt.startswith("You translate prose"):
            for title, writer_output in self.writer_sections.items():
                snippet = f"Section header and text to translate:\n## {title}\n\n{writer_output}"
                if snippet in user_prompt:
                    return self.translated_sections[writer_output]
            raise AssertionError("Unexpected translator prompt")

        raise AssertionError("Unhandled system prompt")


class ReportGenerationAPITests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app.app)
        self._original = app.call_openai_text
        self.fake_caller = FakeOpenAICaller()
        app.call_openai_text = self.fake_caller

        self.outline_payload = {
            "report_title": "Modern Data Governance for AI Teams",
            "sections": [
                {
                    "title": "1. Introduction",
                    "subsections": [
                        "1.1 Why governance matters",
                        "1.2 Key challenges",
                    ],
                },
                {
                    "title": "2. Core Principles",
                    "subsections": [
                        "2.1 Data quality",
                        "2.2 Access control",
                        "2.3 Compliance",
                    ],
                },
            ],
        }

    def tearDown(self):
        app.call_openai_text = self._original
        self.client.close()

    def _expected_report(self):
        return (
            "# Modern Data Governance for AI Teams\n\n"
            "## 1. Introduction\n\n"
            "### 1.1 Why governance matters\n"
            "Narration on why governance matters.\n\n"
            "### 1.2 Key challenges\n"
            "Narration covering key challenges.\n\n"
            "## 2. Core Principles\n\n"
            "### 2.1 Data quality\n"
            "Narration about data quality.\n\n"
            "### 2.2 Access control\n"
            "Narration about access control.\n\n"
            "### 2.3 Compliance\n"
            "Narration about compliance."
        )

    def test_generate_with_outline_ndjson_stream(self):
        payload = {
            "topic": "Modern data governance for AI teams",
            "outline": self.outline_payload,
            "models": {},
            "return": "report_with_outline",
        }

        response = self.client.post("/generate_report", json=payload)
        self.assertEqual(response.status_code, 200)

        lines = [json.loads(line) for line in response.text.strip().splitlines() if line]
        self.assertEqual(lines[0]["status"], "started")
        self.assertEqual(lines[1]["status"], "using_provided_outline")
        self.assertEqual(lines[-1]["status"], "complete")
        self.assertEqual(lines[-1]["report"], self._expected_report())
        self.assertEqual(lines[-1]["outline_used"], self.outline_payload)

    def test_generate_missing_topic_returns_400(self):
        payload = {"mode": "generate_report"}
        response = self.client.post("/generate_report", json=payload)
        self.assertEqual(response.status_code, 400)


if __name__ == "__main__":
    unittest.main()
