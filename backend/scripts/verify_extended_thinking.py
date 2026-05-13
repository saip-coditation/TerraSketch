#!/usr/bin/env python3
"""Verify extended thinking works with the configured Anthropic model.

Tests that:
1. ANTHROPIC_API_KEY is set
2. The model supports extended thinking
3. The response structure is handled correctly
4. Token usage is reported

Usage:
    cd backend
    ANTHROPIC_API_KEY=... python scripts/verify_extended_thinking.py
"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
os.environ.setdefault("DATABASE_URL", "sqlite:///./terrasketch.db")


async def main() -> None:
    from app.core.config import get_settings
    settings = get_settings()

    if not settings.ANTHROPIC_API_KEY:
        print("ERROR: ANTHROPIC_API_KEY is not set in .env")
        return

    print(f"Model: {settings.ANTHROPIC_MODEL}")
    print(f"ANTHROPIC_EXTENDED_THINKING: {settings.ANTHROPIC_EXTENDED_THINKING}")
    print(f"ANTHROPIC_THINKING_BUDGET_TOKENS: {settings.ANTHROPIC_THINKING_BUDGET_TOKENS}")
    print()

    # Test 1: Basic call without extended thinking
    print("Test 1: Basic call (no extended thinking)...")
    try:
        from anthropic import AsyncAnthropic
        client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        resp = await client.messages.create(
            model=settings.ANTHROPIC_MODEL,
            max_tokens=256,
            messages=[{"role": "user", "content": "Reply with exactly: OK"}],
        )
        text = "".join(b.text for b in resp.content if hasattr(b, "text"))
        print(f"  ✅ Basic call OK: '{text.strip()}'")
        print(f"  Tokens: in={resp.usage.input_tokens} out={resp.usage.output_tokens}")
    except Exception as exc:
        print(f"  ❌ Basic call failed: {exc}")
        return

    print()

    # Test 2: Extended thinking
    print("Test 2: Extended thinking call...")
    try:
        resp = await client.messages.create(
            model=settings.ANTHROPIC_MODEL,
            max_tokens=settings.ANTHROPIC_THINKING_BUDGET_TOKENS + 256,
            thinking={"type": "enabled", "budget_tokens": settings.ANTHROPIC_THINKING_BUDGET_TOKENS},
            messages=[{"role": "user", "content": "What is 2+2? Think step by step then answer."}],
        )
        thinking_blocks = [b for b in resp.content if getattr(b, "type", "") == "thinking"]
        text_blocks = [b for b in resp.content if getattr(b, "type", "") == "text"]
        thinking_text = "".join(getattr(b, "thinking", "") for b in thinking_blocks)
        answer = "".join(getattr(b, "text", "") for b in text_blocks)
        print(f"  ✅ Extended thinking OK")
        print(f"  Thinking blocks: {len(thinking_blocks)} ({len(thinking_text)} chars)")
        print(f"  Answer: '{answer.strip()[:100]}'")
        print(f"  Tokens: in={resp.usage.input_tokens} out={resp.usage.output_tokens}")
        print()
        print("  Extended thinking is working correctly with your model.")
        print("  Set ANTHROPIC_EXTENDED_THINKING=true in .env to enable it for generation.")
    except Exception as exc:
        msg = str(exc)
        if "thinking" in msg.lower() or "extended" in msg.lower():
            print(f"  ⚠ Model does not support extended thinking: {msg[:200]}")
            print(f"  Extended thinking requires claude-3-7-sonnet or newer.")
        else:
            print(f"  ❌ Extended thinking call failed: {exc}")

    print()

    # Test 3: Streaming
    print("Test 3: Streaming call...")
    try:
        async with client.messages.stream(
            model=settings.ANTHROPIC_MODEL,
            max_tokens=64,
            messages=[{"role": "user", "content": "Count to 3."}],
        ) as stream:
            chunks = []
            async for text in stream.text_stream:
                chunks.append(text)
            final = await stream.get_final_message()
        print(f"  ✅ Streaming OK: {''.join(chunks).strip()[:60]}")
        print(f"  Tokens: in={final.usage.input_tokens} out={final.usage.output_tokens}")
        print("  Set ANTHROPIC_STREAM=true in .env to enable streaming.")
    except Exception as exc:
        print(f"  ❌ Streaming failed: {exc}")


if __name__ == "__main__":
    asyncio.run(main())
