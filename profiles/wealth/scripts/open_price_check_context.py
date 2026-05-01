#!/usr/bin/env python3
import json

from cron.investment_monitor import ensure_portfolio_config, generate_open_check_context, get_portfolio_path


def main():
    ensure_portfolio_config()
    data = generate_open_check_context(path=get_portfolio_path())
    if data.get("_trading_day") is False:
        print("[SILENT]")
        return
    print(json.dumps(data, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
