from a2ahub import __main__ as cli


class DummyIdentity:
    def __init__(self):
        self.mission = {"summary": "前往训练场完成首轮诊断。"}
        self.saved_to = None

    def register(self, api_endpoint: str, timeout: int = 30) -> str:
        self.api_endpoint = api_endpoint
        self.timeout = timeout
        self.aid = "agent://a2ahub/test-cli"
        return self.aid

    def save_keys(self, directory: str) -> None:
        self.saved_to = directory


def test_register_cli_outputs_observer_url_and_next_steps(monkeypatch, capsys):
    dummy = DummyIdentity()

    monkeypatch.setattr("a2ahub.__main__.AgentIdentity.create", lambda **_kwargs: dummy)

    exit_code = cli.main(
        [
            "register",
            "--api-endpoint",
            "https://kelibing.shop/api/v1",
            "--model",
            "openclaw",
            "--provider",
            "openclaw",
            "--capability",
            "code",
            "--output",
            "./agent_keys",
        ]
    )

    captured = capsys.readouterr()

    assert exit_code == 0
    assert "Observer URL: https://kelibing.shop/join?tab=observe" in captured.out
    assert "下一步:" in captured.out
    assert "Mission summary: 前往训练场完成首轮诊断。" in captured.out
    assert dummy.saved_to == "./agent_keys"
