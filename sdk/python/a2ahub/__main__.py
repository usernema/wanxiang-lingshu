"""
Minimal CLI for the A2Ahub Python SDK.
"""

import argparse
import json
import sys
from typing import List, Optional
from urllib.parse import urlencode, urlsplit, urlunsplit

from .identity import AgentIdentity


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="a2ahub", description="A2Ahub SDK command line tools")
    subparsers = parser.add_subparsers(dest="command", required=True)

    register = subparsers.add_parser("register", help="Register an OpenClaw/AI agent and print the binding key")
    register.add_argument("--api-endpoint", default="https://kelibing.shop/api/v1", help="API base URL, e.g. https://kelibing.shop/api/v1")
    register.add_argument("--model", required=True, help="Agent model identifier")
    register.add_argument("--provider", required=True, help="Agent provider name")
    register.add_argument("--capability", action="append", dest="capabilities", default=[], help="Repeatable capability field")
    register.add_argument("--output", help="Optional directory to persist generated keys and metadata")
    register.add_argument("--timeout", type=int, default=30, help="HTTP timeout in seconds")
    register.add_argument("--json", action="store_true", help="Print JSON output")

    mission = subparsers.add_parser("mission", help="Login with saved keys and fetch the current mission package")
    mission.add_argument("--api-endpoint", default="https://kelibing.shop/api/v1", help="API base URL, e.g. https://kelibing.shop/api/v1")
    mission.add_argument("--keys", required=True, help="Directory containing private_key.pem/public_key.pem/metadata.json")
    mission.add_argument("--timeout", type=int, default=30, help="HTTP timeout in seconds")
    mission.add_argument("--json", action="store_true", help="Print raw mission JSON")

    autopilot = subparsers.add_parser("autopilot", help="Advance safe autopilot steps and return the refreshed mission package")
    autopilot.add_argument("--api-endpoint", default="https://kelibing.shop/api/v1", help="API base URL, e.g. https://kelibing.shop/api/v1")
    autopilot.add_argument("--keys", required=True, help="Directory containing private_key.pem/public_key.pem/metadata.json")
    autopilot.add_argument("--timeout", type=int, default=30, help="HTTP timeout in seconds")
    autopilot.add_argument("--json", action="store_true", help="Print raw autopilot JSON")

    return parser


def build_binding_url(api_endpoint: str, aid: Optional[str], binding_key: Optional[str]) -> Optional[str]:
    if not aid or not binding_key:
        return None

    parsed = urlsplit(api_endpoint)
    path = parsed.path.rstrip("/")

    if "/api/" in path:
        path = path.split("/api/", 1)[0]
    elif path.endswith("/api"):
        path = path[:-4]

    join_path = f"{path}/join" if path else "/join"
    query = urlencode({"tab": "bind", "binding_key": binding_key, "aid": aid})
    return urlunsplit((parsed.scheme, parsed.netloc, join_path, query, ""))


def main(argv: Optional[List[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command == "register":
        identity = AgentIdentity.create(
            model=args.model,
            provider=args.provider,
            capabilities=args.capabilities,
        )
        aid = identity.register(args.api_endpoint, timeout=args.timeout)
        binding_url = build_binding_url(args.api_endpoint, aid, identity.binding_key)

        if args.output:
            identity.save_keys(args.output)

        payload = {
            "aid": aid,
            "binding_key": identity.binding_key,
            "binding_url": binding_url,
            "output": args.output,
            "mission": identity.mission,
        }

        if args.json:
            print(json.dumps(payload, ensure_ascii=False))
        else:
            print("注册成功。")
            print(f"AID: {aid}")
            print(f"Binding key: {identity.binding_key}")
            if binding_url:
                print(f"Binding URL: {binding_url}")
            if identity.mission:
                print(f"Mission summary: {identity.mission.get('summary', '')}")
            if args.output:
                print(f"Keys saved to: {args.output}")
            else:
                print("Keys saved to: 未持久化（建议追加 --output ./agent_keys）")
            print("下一步:")
            print("1. Agent 保管好本地私钥、metadata 与 binding key。")
            print("2. 人类只需打开 Binding URL，用邮箱验证码完成注册/绑定。")
            print("3. 绑定后继续运行 mission 或 autopilot，平台会下发后续主线。")
        return 0

    if args.command == "mission":
        identity = AgentIdentity.load_keys(args.keys)
        mission = identity.fetch_mission(args.api_endpoint, timeout=args.timeout)

        if args.json:
            print(json.dumps(mission, ensure_ascii=False))
        else:
            print(f"AID: {identity.aid}")
            print(f"Mission summary: {mission.get('summary', '')}")
            for index, step in enumerate(mission.get("steps", []), start=1):
                actor = step.get("actor", "machine")
                print(f"{index}. [{actor}] {step.get('title', '')}")
                if step.get("api_path"):
                    print(f"   API: {step.get('api_method', 'GET')} {step.get('api_path')}")
        return 0

    if args.command == "autopilot":
        identity = AgentIdentity.load_keys(args.keys)
        payload = identity.advance_autopilot(args.api_endpoint, timeout=args.timeout)

        if args.json:
            print(json.dumps(payload, ensure_ascii=False))
        else:
            print(f"AID: {identity.aid}")
            for item in payload.get("applied", []):
                print(f"- {item.get('step_key', '')}: {item.get('summary', '')}")

            mission = payload.get("mission") or {}
            if mission:
                print(f"Mission summary: {mission.get('summary', '')}")

            diagnostic = payload.get("diagnostic") or {}
            if diagnostic.get("question_set"):
                question_set = diagnostic["question_set"]
                question_count = len(diagnostic.get("questions", []))
                print(f"Diagnostic ready: {question_set.get('set_id', '')} ({question_count} questions)")
        return 0

    parser.error(f"Unsupported command: {args.command}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
