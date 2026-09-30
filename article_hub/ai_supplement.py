"""Explicit, per-article supplementation of already reviewed network images."""
import json
import os
import sys
from . import image_review as review, sourcing as src
from .hits import Hit


def run(topic):
    review.ensure_editable(topic)
    folder = review.topic_path(topic)
    document = review.source_document(folder)
    manifest_path = folder / src.MANIFEST_FILE
    if not manifest_path.exists():
        raise ValueError('请先完成网络搜图，保存配图清单后再补 AI 图。')
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    selected = review.load_selection(folder)
    positions = review.load_positions(folder)
    chosen = []
    for item in manifest.get('配图', []):
        name = item['原始文件名']
        if selected is not None and name not in selected:
            continue
        file = review.image_path(topic, name)
        position = positions.get(name, item.get('插入到段落', -1))
        role = '封面' if selected and name == selected[0] else item.get('角色', '正文配图')
        hit = Hit(item.get('平台', '网络'), item.get('搜索词', ''), item.get('原始标题', name),
                  item.get('来源', ''), item.get('图片链接', ''), item.get('文章链接', ''))
        chosen.append(src.Chosen(hit, file, role, -1, item.get('插入到小标题', ''),
                                item.get('图注', ''), item.get('宽', 0), item.get('高', 0), 0, position))
    before = len(chosen)
    target = review.target_count(folder)
    if before >= target:
        print(f'已有 {before} 张，建议 {target} 张，无需生成。')
        return
    if not src._image_ai_profile():
        raise ValueError('尚未配置可用的图片生成模型。原网络图片保留。')
    os.environ['ARTICLE_HUB_ALLOW_AI_IMAGES'] = '1'
    queries = src.load_queries(folder, document)
    print(f'保留 {before} 张现有图片，最多补 {target-before} 张 AI 图片。', flush=True)
    src.supplement_with_ai(document, chosen, max_images=target,
                           target_count=target, topic_dir=folder, queries=queries)
    if len(chosen) == before:
        raise ValueError('AI 未生成可用图片，现有网络图片未改变。')
    src.write_topic_outputs(folder, document, queries, chosen, warnings=['AI补图待预览确认，请确认后生成成稿。'])
    new_names = [item.file.name for item in chosen[before:]]
    review.save_candidate_review(topic, new_names)
    print(f'已补 {len(chosen)-before} 张 AI 候选图，均为待审核；请逐张确认后再定稿。')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('请选择一篇已经完成网络配图的文章。')
    run(sys.argv[1])
