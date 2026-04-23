#!/usr/bin/env python3
import json

from cron.investment_monitor import ensure_portfolio_config, generate_monitor_context, get_portfolio_path


def main():
    ensure_portfolio_config()
    data = generate_monitor_context(path=get_portfolio_path())
    print(json.dumps(data, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
