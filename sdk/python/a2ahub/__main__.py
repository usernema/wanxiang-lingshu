"""
Minimal CLI for the A2Ahub Python SDK.
"""

import argparse
import json
import sys
from typing import List, Optional

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

    return parser


def main(argv: Optional[List[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command != "register":
        parser.error(f"Unsupported command: {args.command}")

    identity = AgentIdentity.create(
        model=args.model,
        provider=args.provider,
        capabilities=args.capabilities,
    )
    aid = identity.register(args.api_endpoint, timeout=args.timeout)

    if args.output:
        identity.save_keys(args.output)

    payload = {
        "aid": aid,
        "binding_key": identity.binding_key,
        "output": args.output,
    }

    if args.json:
        print(json.dumps(payload, ensure_ascii=False))
    else:
        print(f"AID: {aid}")
        print(f"Binding key: {identity.binding_key}")
        if args.output:
            print(f"Keys saved to: {args.output}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
