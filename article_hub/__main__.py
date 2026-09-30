"""文章总库命令行入口。"""

from __future__ import annotations

import argparse
import os
import sys
import unicodedata
from datetime import datetime
from pathlib import Path

from . import config, layout, library, sourcing


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="article_hub", description="文章总库：排版图文 + 调取到各平台")
    sub = p.add_subparsers(dest="command", required=True)

    fmt = sub.add_parser("排版", aliases=["format"], help="把未排版文章里的 Word 和图片合成带图成稿")
    fmt.add_argument("--only", help="只处理指定主题文件夹")
    fmt.add_argument("--force", action="store_true", help="成稿已存在时覆盖重排")
    fmt.add_argument("--图注", action="store_true", help="把配图清单里的图注写入成稿")
    fmt.add_argument("--最多图片", type=int, default=7, help="每篇最多用几张图，默认 7")

    sub.add_parser("状态", aliases=["status"], help="查看每篇稿件在各平台的进度")
    sub.add_parser("预览", aliases=["preview"], help="生成总库预览网页")
    sub.add_parser("时间表", aliases=["schedule"], help="按时间列出每篇稿子发到哪个平台")
    sub.add_parser("身份检查", aliases=["identity-check"],
                   help="只读检查文章 ID 迁移条件，不修改台账")

    topic = sub.add_parser("选题", aliases=["topics"],
                           help="抓今日头条与微博热榜，挑候选，写选题卡和提示词")
    topic.add_argument("--数量", type=int, default=3, help="挑几条候选，默认 3 条")

    topic.add_argument("--话题", default="", help="话题分类，逗号分隔；留空不限")
    topic.add_argument("--来源", default="今日头条,微博", help="热榜来源，用逗号分隔")

    listing = sub.add_parser("选题清单", aliases=["topic-list"],
                             help="把今天的选题卡连路径和正文打出来（给 Codex 读）")
    listing.add_argument("--数量", type=int, default=3, help="最多列几条，默认 3 条")

    gen = sub.add_parser("生成提示词", aliases=["make-prompts"],
                         help="调模型把今天的选题写成「得到大脑提示词」")
    gen.add_argument("--数量", type=int, default=3, help="处理几条，默认 3 条")
    gen.add_argument("--模型", help="换一个模型（默认用配置里的）")

    find = sub.add_parser("找选题", aliases=["find-topics"],
                          help="一键：抓头条与微博热榜 + 调模型写「得到大脑提示词」")
    find.add_argument("--数量", type=int, default=3, help="找几条，默认 3 条")
    find.add_argument("--模型", help="换一个模型（默认用配置里的）")

    find.add_argument("--话题", default="", help="话题分类，逗号分隔；留空不限")
    find.add_argument("--来源", default="今日头条,微博", help="热榜来源，用逗号分隔")

    console = sub.add_parser("控制台", aliases=["console"],
                             help="打开可视化控制台（本地网页，点按钮跑各步骤）")
    send = sub.add_parser("送草稿", aliases=["send"],
                          help="一步到位：先把成稿调取到平台，再送进该平台草稿箱")
    send.add_argument("--平台", required=True, help="今日头条 / 知乎 / 百家号")
    send.add_argument("--only", help="只处理指定主题")
    console.add_argument("--端口", type=int, default=18765, help="本地端口，默认 8765")
    console.add_argument("--外部访问源", help="可选：单个 HTTPS 源，精确匹配协议、主机与端口")
    console.add_argument("--启用局域网测试", action="store_true",
                         help="显式启动受精确设备 IP 限制的 HTTPS 局域网测试入口")
    console.add_argument("--监听地址", help="局域网测试时绑定的单个本机 IPv4 地址")
    console.add_argument("--允许设备IP", action="append", default=[],
                         help="局域网测试时允许访问的设备 IPv4 地址；可重复指定")
    console.add_argument("--测试证书", help="局域网测试用开发区 PEM 证书路径")
    console.add_argument("--测试私钥", help="局域网测试用开发区 PEM 私钥路径")
    console.add_argument("--不打开", action="store_true", help="只起服务，不自动开窗口")

    plan = sub.add_parser("排期", aliases=["plan"], help="给还没排期的稿子排首发和后续时间")
    plan.add_argument("--主题", help="只排一篇（主题名或标题）")
    plan.add_argument("--时间", help="这一篇的首发时间，例如 2026-09-16 20:00；不写就排到下一个空位")
    plan.add_argument("--从", help="从哪一天开始排，例如 2026-09-16；默认从下一个空闲日开始，一天一篇")
    plan.add_argument("--重排", action="store_true",
                      help="把还没发的计划全部清掉重排（已经登记的实际发布时间不动）")

    rec = sub.add_parser("记发布", aliases=["record"], help="登记某篇在某平台的实际发布时间")
    rec.add_argument("--主题", required=True, help="主题名或标题")
    rec.add_argument("--平台", required=True, help="今日头条 / 知乎 / 百家号")
    rec.add_argument("--时间", help="不写就是现在；也可以写 2026-09-16 20:00")

    pick = sub.add_parser("调取", aliases=["dispatch"], help="把成稿复制到某个平台的待发文章")
    pick.add_argument("--平台", required=True, help="知乎 / 今日头条 / 百家号 / 全部")
    pick.add_argument("--only", help="只调取指定主题")
    pick.add_argument("--覆盖", action="store_true", help="待发目录已有同名文件时覆盖")

    key = sub.add_parser("关键词", aliases=["keywords"],
                         help="读一篇稿子，列出关键词和配图搜索词（不找图）")
    key.add_argument("--only", help="只处理一个主题：未排版的文件夹名，或已排版文章里的主题名")
    key.add_argument("--数量", type=int, default=12, help="关键词和搜索词各显示多少条，默认 12")
    key.add_argument("--覆盖", action="store_true", help="搜索词.txt 已存在时也按自动结果重写")

    src = sub.add_parser("配图", aliases=["find-images"],
                         help="读文章取搜索词，在头条/小红书上找图，配好图并排版")
    src.add_argument("--only", help="只处理指定主题（散落在根目录的 Word 写文件名即可）")
    src.add_argument("--来源", default="全网",
                     help="图源，逗号分开：全网、今日头条、小红书；默认全网与国内新闻图源")
    src.add_argument("--最多图片", type=int, default=7, help="每篇最多用几张图，默认 7")
    src.add_argument("--force", action="store_true", help="已经有图片或成稿时也重新配")
    src.add_argument("--只生成搜索词", action="store_true", help="只写 搜索词.txt，先不搜图不排版")
    src.add_argument("--不排版", action="store_true", help="只把图配进未排版文件夹，不生成成稿")
    src.add_argument("--无图注", action="store_true", help="排版时不把图注写进正文")

    sub.add_parser("登录小红书", aliases=["login-xhs"],
                   help="打开专用 Edge 登录小红书，登录一次以后就能自动搜图")
    return p


def do_format(args) -> int:
    topics = [path for path in sorted(config.UNFORMATTED.iterdir()) if path.is_dir()] \
        if config.UNFORMATTED.exists() else []
    if args.only:
        topics = [path for path in topics if path.name == args.only]
    if not topics:
        print("未排版文章里没有待处理的文件夹。把「一个主题一个文件夹」的 Word 和图片放进去再运行。")
        return 0
    done = 0
    failed = 0
    for topic in topics:
        try:
            result = layout.format_topic(topic, force=args.force, captions_on=args.图注,
                                         max_images=max(1, args.最多图片))
        except layout.LayoutError as exc:
            failed += 1
            print(f"[跳过] {topic.name}：{exc}")
            continue
        try:
            archive = layout.archive_source(topic, result)
        except layout.LayoutError as exc:
            failed += 1
            print(f"[待处理] {topic.name}：成稿已生成，但{exc}")
            continue
        print(f"[完成] {result.title}")
        print(f"       成稿：{result.docx}")
        print(f"       原始素材：{archive}")
        print(f"       配图 {result.images} 张，封面：{result.cover or '无'}")
        for warning in result.warnings:
            print(f"       提示：{warning}")
        done += 1
    data = library.refresh_ledger()
    print(f"\n本次排版 {done} 篇；总库现有成稿 {len(data['文章'])} 篇。")
    return 1 if failed else 0


def do_status() -> int:
    rows = library.status_rows()
    if not rows:
        print("总库里还没有稿件。")
        return 0
    width = max(len(row["主题"]) for row in rows)
    for row in rows:
        marks = []
        for name in config.PLATFORM_ORDER:
            if name in row["已发"]:
                marks.append(f"{name}✅草稿箱")
            elif name in row["分发"]:
                marks.append(f"{name}⏳待发")
            else:
                marks.append(f"{name}－")
        if row["状态"] == "未排版":
            print(f"{row['主题']:<{width}}  ⚠️ 未排版  " + "  ".join(marks))
        else:
            print(f"{row['主题']:<{width}}  ✅已排版(配图{row.get('配图数', 0)})  " + "  ".join(marks))
            print(f"{'':<{width}}  {row.get('显示标题') or row['标题']}")
    print("\n✅ 已入草稿箱 = 平台系统已保存并回读验证；⏳ 已调取到该平台待发文章，等运行平台脚本。")
    print("标题后的括号是这篇稿子已经分发到的平台，例如「文章A（知乎头条）」。")
    due, unscheduled = library.schedule_todo(library.schedule_entries())
    todo = []
    if due:
        todo.append("到点该发 " + "、".join(due))
    if unscheduled:
        todo.append(f"没排期 {len(unscheduled)} 篇")
    if todo:
        print("发文时间表：" + "；".join(todo) + "（双击 12-查看发文时间表.cmd）")
    return 0


def _width(text: str) -> int:
    """中文按两个字宽算，表才对得齐。"""
    return sum(2 if unicodedata.east_asian_width(char) in "WF" else 1 for char in text)


def _pad(text: str, width: int) -> str:
    return text + " " * max(0, width - _width(text))


def _clip(text: str, width: int) -> str:
    """太长的标题按显示宽度截断，留一个省略号。"""
    if _width(text) <= width:
        return text
    kept, used = "", 0
    for char in text:
        size = 2 if unicodedata.east_asian_width(char) in "WF" else 1
        if used + size > width - 1:
            break
        kept += char
        used += size
    return kept + "…"


def do_topics(args) -> int:
    from . import topics

    return topics.run(count=max(1, args.数量), sources_names=args.来源.split(","), categories=args.话题)


def do_console(args) -> int:
    from . import console, console_network

    supplied_lan_options = any((args.监听地址, args.允许设备IP,
                                args.测试证书, args.测试私钥))
    if args.启用局域网测试 or supplied_lan_options:
        if not args.启用局域网测试:
            print("局域网测试配置只能配合 --启用局域网测试 使用。")
            return 2
        if args.外部访问源 is not None:
            print("局域网测试不能与反向代理来源配置混用。")
            return 2
        try:
            lan_config = console_network.build_lan_test_config(
                root=config.ROOT,
                bind_address=args.监听地址,
                port=args.端口,
                allowed_device_ips=args.允许设备IP,
                certificate_path=args.测试证书,
                private_key_path=args.测试私钥,
            )
        except (OSError, ValueError) as exc:
            print(f"局域网测试配置无效，拒绝启动：{exc}")
            return 2
        os.environ["ARTICLE_HUB_ALLOWED_ORIGIN"] = lan_config.origin
        return console.serve_lan_test(lan_config)
    if args.外部访问源 is not None:
        os.environ["ARTICLE_HUB_ALLOWED_ORIGIN"] = args.外部访问源

    return console.serve(port=args.端口, open_browser=not args.不打开)


PLATFORM_MODULES = {
    "今日头条": ("toutiao_drafts", str(config.ROOT / "平台" / "今日头条")),
    "知乎": ("zhihu_drafts", str(config.ROOT / "平台" / "知乎")),
    "百家号": ("baijiahao_drafts", str(config.ROOT / "平台" / "百家号")),
}
PLATFORM_ALIASES = {"头条": "今日头条", "今日头条": "今日头条",
                    "知乎": "知乎", "百家号": "百家号"}


def do_send(args) -> int:
    """Delegate safe staging and verified draft saving to one workflow."""
    from . import draft_flow

    platform = PLATFORM_ALIASES.get(str(args.平台).strip(), str(args.平台).strip())
    if platform not in PLATFORM_MODULES:
        print(f"未知的平台：{platform}；目前支持：{'、'.join(PLATFORM_MODULES)}")
        return 1
    return draft_flow.run_all([platform], only=args.only)


def do_schedule() -> int:
    now = datetime.now()
    entries = library.schedule_entries(now=now)
    rules = config.load_publish_rules()
    path = library.write_schedule_page(entries, now=now)
    later = "、".join(f"{name} 等 {hours} 小时" for name, hours in rules["间隔小时"].items()
                     if name != rules["首发平台"])
    print(f"发文时间表（现在 {now.strftime('%m-%d %H:%M')}）")
    print(f"规则：{rules['首发平台']} 首发" + (f"，之后 {later}" if later else "")
          + f"；每天发布时刻 {rules['发布时间']}。")
    if not entries:
        print("\n总库里还没有稿子。")
        return 0
    labels = {"已发": "✅已发", "该发了": "⚠️该发", "等到点": "⏳等到点",
              "等首发": "🔒等首发", "未排期": "❌未排期", "没排期": "－"}
    rows: list[tuple[str, str, str, str]] = []
    for item in entries:
        if item["实际"] is not None:
            when = library.format_when(item["实际"]) + " 已发"
        elif item["计划"] is not None:
            when = (item["计划"].strftime("%m-%d ") + library.WEEKDAYS[item["计划"].weekday()]
                    + item["计划"].strftime(" %H:%M"))
        else:
            when = "—"
        rows.append((when, item["平台"] + ("·首发" if item["首发"] else ""),
                     item["标题"], labels.get(item["状态"], item["状态"])))
    header = ("时间", "平台", "文章", "状态")
    widths = [max(_width(row[index]) for row in [header] + rows) for index in range(4)]
    widths[2] = min(widths[2], 40)
    print()
    print("  ".join(_pad(text, widths[index]) for index, text in enumerate(header)))
    for row in rows:
        cells = [_pad(_clip(text, widths[index]) if index == 2 else text, widths[index])
                 for index, text in enumerate(row)]
        print("  ".join(cells))
    due, unscheduled = library.schedule_todo(entries)
    waiting = [item for item in entries if item["状态"] == "等首发"]
    print()
    if due:
        print("到点该发：" + "、".join(due))
    if waiting:
        print(f"等首发：{len(waiting)} 条（{rules['首发平台']}还没登记实际发布时间）")
    if unscheduled:
        print(f"没排期 {len(unscheduled)} 篇 —— 双击 13-给新稿排期.cmd")
    print(f"\n网页版：{path}")
    print("发完一篇就双击 14-登记已发布.cmd，后面的平台会自动顺延。")
    return 0


def do_plan(args) -> int:
    try:
        result = library.plan_schedule(only=args.主题, first_time=args.时间,
                                       start_after=args.从, reset=args.重排)
    except ValueError as exc:
        print(exc)
        return 1
    planned = result["排期"]
    if not planned:
        print("所有稿子都已经排过期了。想改某一篇，用 --主题 加上 --时间。")
        return 0
    for item in planned:
        later = "、".join(f"{name} {library.format_when(moment)}" for name, moment in item["后续"])
        print(f"[排期] {item['标题']}")
        print(f"       首发 {result['规则']['首发平台']} {library.format_when(item['首发'])}"
              + (f"；之后 {later}" if later else ""))
    print(f"\n排了 {len(planned)} 篇。双击 12-查看发文时间表.cmd 看整张表。")
    return 0


def do_record(args) -> int:
    try:
        result = library.record_publish(args.主题, args.平台, args.时间)
    except ValueError as exc:
        print(exc)
        return 1
    print(f"[已登记] {result['标题']} · {result['平台']} "
          f"{result['时间'].strftime('%Y-%m-%d %H:%M')}")
    for name, moment in result["后续"]:
        print(f"         {name} 顺延到 {library.format_when(moment)}")
    if result["后续"]:
        print("\n到点后照常调取、发布，发完同样登记一下。")
    return 0


def do_dispatch(args) -> int:
    wanted = str(args.平台).strip()
    names = list(config.PLATFORM_ORDER) if wanted in {"全部", "全部平台", "all"} else [wanted]
    platforms = config.load_platforms()
    for name in names:
        try:
            result = library.dispatch(name, only=args.only, overwrite=args.覆盖)
        except ValueError as exc:
            print(exc)
            return 1
        if len(names) > 1:
            print(f"\n===== {name} =====")
        for title, target in result.copied:
            print(f"[调取] {title} → {target}")
        for title, reason in result.skipped:
            print(f"[跳过] {title}：{reason}")
        print(f"共调取 {len(result.copied)} 篇到{name}待发文章。")
        if not result.copied:
            continue
        root = platforms.get(name, {}).get("root")
        if name == "今日头条":
            print(f"接下来打开 {root} 目录，双击「02-保存一篇到草稿箱」把成稿送进头条草稿箱。")
        else:
            print(f"接下来打开 {root} 目录，双击「保存一篇到草稿箱」即可带图进草稿箱。")
    return 0


def do_preview() -> int:
    rows = library.status_rows()
    path = library.write_index(rows)
    print(f"已生成总库预览：{path}")
    table = library.write_schedule_page()
    print(f"已生成发文时间表：{table}")
    return 0


def do_source(args) -> int:
    os.environ.setdefault('ARTICLE_HUB_IMAGE_AI', '1')
    names = [part for part in str(args.来源).replace("，", ",").replace(" ", ",").split(",") if part]
    return sourcing.run(
        only=args.only,
        sources_names=names,
        max_images=max(1, args.最多图片),
        force=args.force,
        queries_only=args.只生成搜索词,
        do_layout=not args.不排版,
        captions=not args.无图注,
    )


def do_keywords(args) -> int:
    return sourcing.keywords_report(only=args.only, limit=max(1, args.数量),
                                    overwrite=args.覆盖)


def do_identity_check() -> int:
    from . import identity
    from .storage import load_ledger_file

    # This command is intentionally outside the normal ensure-directories and
    # ledger-lock path: an audit must not create a directory or lock file.
    try:
        ledger = load_ledger_file(library.LEDGER, missing={"文章": {}})
        scanned = []
        for item in library.scan_formatted():
            if not isinstance(item, dict):
                scanned.append(item)
                continue
            snapshot = dict(item)
            if "指纹" not in snapshot:
                try:
                    document = library.read_document(Path(snapshot["成稿"]))
                    text = "\n\n".join(
                        block.text for block in document.blocks
                        if block.kind in {"h2", "h3", "p"}
                    )
                    snapshot["指纹"] = library.fingerprint(document.title, text)
                except Exception:
                    # The analyzer reports this as a blocking missing scan
                    # fingerprint without exposing a path or document title.
                    snapshot["指纹"] = None
            scanned.append(snapshot)
        report = identity.analyze_identity_migration(ledger, scanned)
    except Exception:
        print("文章身份只读检查失败：台账或成稿无法安全读取。")
        return 1
    print(identity.render_identity_report(report))
    return 1 if report.get("阻断数") else 0


def do_login_xhs() -> int:
    from .xiaohongshu import XiaohongshuError, XiaohongshuSource

    source = XiaohongshuSource()
    try:
        source.open()
        ok = source.login()
    except XiaohongshuError as exc:
        print(exc)
        return 1
    finally:
        source.close()
    if not ok:
        return 1
    print("小红书登录完成。之后运行「配图」时会一起搜小红书。")
    return 0


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    args = parser().parse_args(argv)
    command = args.command
    if command in ("身份检查", "identity-check"):
        return do_identity_check()
    config.ensure_directories()
    if command in ("排版", "format"):
        return do_format(args)
    if command in ("状态", "status"):
        return do_status()
    if command in ("调取", "dispatch"):
        return do_dispatch(args)
    if command in ("预览", "preview"):
        return do_preview()
    if command in ("时间表", "schedule"):
        return do_schedule()
    if command in ("选题", "topics"):
        return do_topics(args)
    if command in ("选题清单", "topic-list"):
        from . import topics

        return topics.listing(limit=max(1, args.数量))
    if command in ("生成提示词", "make-prompts"):
        from . import topics

        return topics.generate_prompts(limit=max(1, args.数量), model=args.模型)
    if command in ("找选题", "find-topics"):
        from . import topics

        return topics.find_topics(count=max(1, args.数量), model=args.模型, sources_names=args.来源.split(","), categories=args.话题)
    if command in ("控制台", "console"):
        return do_console(args)
    if command in ("送草稿", "send"):
        return do_send(args)
    if command in ("排期", "plan"):
        return do_plan(args)
    if command in ("记发布", "record"):
        return do_record(args)
    if command in ("配图", "find-images"):
        return do_source(args)
    if command in ("关键词", "keywords"):
        return do_keywords(args)
    if command in ("登录小红书", "login-xhs"):
        return do_login_xhs()
    parser().error(f"未知命令：{command}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
