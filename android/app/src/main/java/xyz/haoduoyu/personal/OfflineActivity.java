package xyz.haoduoyu.personal;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DatePickerDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.inputmethod.InputMethodManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.PopupMenu;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Iterator;
import java.util.List;
import java.util.Arrays;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.HashMap;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;
import xyz.haoduoyu.personal.offline.OfflineRuntime;

/** Native, local-first high-frequency workspace. The original WebView remains a separate entry. */
public final class OfflineActivity extends Activity {
    private static final int PAPER = Color.rgb(248, 245, 239), INK = Color.rgb(42, 47, 43);
    private static final int MUTED = Color.rgb(107, 116, 109), ACCENT = Color.rgb(40, 104, 76);
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService startupAndLogin = Executors.newSingleThreadExecutor();
    private OfflineRuntime runtime;
    private TextView status, heading, empty;
    private LinearLayout rows, tabs;
    private EditText composer;
    private ScrollView scroll;
    private Button save, dateButton, memoGroupButton;
    private volatile String selectedGroup="";
    private String tab = "todo", date = today(), slot = "";
    private boolean settingText, saving, alive;
    private int renderGeneration;
    private final Map<String,String> latestDrafts = new HashMap<>();
    private long lastBack;
    private android.window.OnBackInvokedCallback backCallback;
    private final Runnable refresh = () -> { if (alive && runtime != null) render(); };

    private static String today() { return LocalDate.now(ZoneId.of("Asia/Shanghai")).toString(); }
    private int dp(int size) { return Math.round(size * getResources().getDisplayMetrics().density); }
    private TextView text(String value, int size, int color) {
        TextView view = new TextView(this); view.setText(value); view.setTextSize(size); view.setTextColor(color); return view;
    }
    private Button button(String value) {
        Button view = new Button(this); view.setText(value); view.setAllCaps(false); view.setTextColor(INK); return view;
    }

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        alive = true;
        tab = saved == null ? "todo" : saved.getString("tab", "todo");
        date = saved == null ? today() : saved.getString("date", today());
        try { LocalDate.parse(date); } catch (Exception badDate) { date = today(); }
        if (!Arrays.asList("todo", "life", "work", "memo", "reminder", "article").contains(tab)) tab = "todo";
        buildLayout();
        save.setEnabled(false); dateButton.setEnabled(false);
        for(int i=0;i<tabs.getChildCount();i++)tabs.getChildAt(i).setEnabled(false);
        status.setText("正在读取本机资料，可以先输入…");
        if (saved != null && saved.containsKey("draft")) setComposer(saved.getString("draft", ""));
        if (Build.VERSION.SDK_INT >= 33) {
            backCallback = this::handleBack;
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, backCallback);
        }
        startupAndLogin.execute(() -> {
            try {
                OfflineRuntime ready = OfflineRuntime.get(getApplicationContext());
                // Wait behind any previous Activity's queued save before restoring its draft.
                ready.local.execute(() -> main.post(() -> {
                    if(!alive)return;
                    runtime=ready;
                    selectedGroup=runtime.repository.uiState("memo_group","");
                    String typed=composer.getText().toString();
                    if(saved==null&&typed.isEmpty()){
                        tab=runtime.repository.uiState("tab","todo");date=runtime.repository.uiState("date",today());
                        if(!Arrays.asList("todo","life","work","memo","reminder","article").contains(tab))tab="todo";
                        try{LocalDate.parse(date);}catch(Exception invalid){date=today();}
                    }
                    restoreComposer();
                    if(!typed.isEmpty()){
                        String recovered=composer.getText().toString(),target=slot;
                        if(!recovered.isEmpty()&&!typed.equals(recovered))slot=target+":launch-"+UUID.randomUUID();
                        setComposer(typed);
                        latestDrafts.put(slot,typed);runtime.queueDraft(slot,typed,()->error("输入草稿尚未完成落盘"));
                    }
                    save.setEnabled(true);dateButton.setEnabled(true);for(int i=0;i<tabs.getChildCount();i++)tabs.getChildAt(i).setEnabled(true);
                    runtime.listen(refresh);render();runtime.requestSync();
                    int y=0;try{y=saved==null?Integer.parseInt(runtime.repository.uiState("scroll:"+tab,"0")):saved.getInt("scroll",0);}catch(NumberFormatException ignored){}
                    final int position=y;scroll.post(()->scroll.scrollTo(0,position));
                }));
            }catch(Exception failure){main.post(()->{if(alive){status.setText("本机资料暂时无法读取；没有清空或重建数据库。输入尚未保存，请先复制保留。");save.setEnabled(false);}});}
        });
    }

    private void buildLayout() {
        LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(PAPER);
        setContentView(root);
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                android.graphics.Insets ime = insets.getInsets(WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
                return WindowInsets.CONSUMED;
            });
            root.requestApplyInsets();
        } else root.setFitsSystemWindows(true);
        LinearLayout top = new LinearLayout(this); top.setGravity(Gravity.CENTER_VERTICAL); top.setPadding(dp(18), dp(4), dp(8), 0);
        TextView title = text("好多鱼", 24, INK); title.setTypeface(null, Typeface.BOLD);
        top.addView(title, new LinearLayout.LayoutParams(0, dp(52), 1));
        Button more = button("更多"); top.addView(more, new LinearLayout.LayoutParams(dp(78), dp(48))); more.setOnClickListener(v -> showMenu(more));
        root.addView(top);
        status = text("本机资料 · 即写即存", 12, MUTED); status.setPadding(dp(18), 0, dp(18), dp(8));
        status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE); status.setOnClickListener(v -> showSyncDetails()); root.addView(status);
        tabs = new LinearLayout(this);
        for (String[] item : new String[][]{{"todo","待办"},{"life","生活"},{"work","工作"},{"memo","备忘"},{"reminder","提醒"},{"article","图文"}}) {
            Button select = button(item[1]); select.setTextSize(12); select.setMinWidth(0); select.setMinimumWidth(0); select.setPadding(0,0,0,0);
            select.setTag(item[0]); select.setOnClickListener(v -> changeTab(item[0])); tabs.addView(select, new LinearLayout.LayoutParams(0, dp(48), 1));
        }
        root.addView(tabs);
        LinearLayout section = new LinearLayout(this); section.setGravity(Gravity.CENTER_VERTICAL); section.setPadding(dp(18), dp(10), dp(10), dp(4));
        heading = text("今天要做的事", 20, INK); heading.setTypeface(null, Typeface.BOLD); section.addView(heading, new LinearLayout.LayoutParams(0, dp(48), 1));
        memoGroupButton=button("新建到：我的备忘录");memoGroupButton.setTextSize(12);memoGroupButton.setMaxLines(1);memoGroupButton.setVisibility(View.GONE);memoGroupButton.setOnClickListener(v->chooseMemoGroup());section.addView(memoGroupButton,new LinearLayout.LayoutParams(dp(150),dp(48)));
        dateButton = button(date); dateButton.setTextSize(13); dateButton.setOnClickListener(v -> chooseDate()); section.addView(dateButton); root.addView(section);
        scroll = new ScrollView(this); scroll.setFillViewport(true); rows = new LinearLayout(this); rows.setOrientation(LinearLayout.VERTICAL); rows.setPadding(dp(16), dp(4), dp(16), dp(20));
        scroll.addView(rows); root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        LinearLayout compose = new LinearLayout(this); compose.setGravity(Gravity.CENTER_VERTICAL); compose.setPadding(dp(14), dp(8), dp(10), dp(10));
        composer = new EditText(this); composer.setTextColor(INK); composer.setTextSize(16); composer.setSingleLine(false); composer.setMaxLines(5); composer.setMinLines(1);
        composer.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        composer.setContentDescription("本机输入，联网后同步"); compose.addView(composer, new LinearLayout.LayoutParams(0, -2, 1));
        save = button("添加"); save.setTextColor(ACCENT); compose.addView(save, new LinearLayout.LayoutParams(dp(74), dp(52))); save.setOnClickListener(v -> saveComposer()); root.addView(compose);
        composer.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) {
                if (settingText || runtime == null) return;
                String draft = s.toString(), target = slot;
                latestDrafts.put(target,draft);runtime.queueDraft(target,draft,()->error("草稿尚未成功落盘，请保留输入内容"));
            }
            @Override public void afterTextChanged(Editable editable) {}
        });
    }

    private void setComposer(String value) { settingText = true; composer.setText(value); composer.setSelection(composer.length()); settingText = false; }
    private void restoreComposer() { slot = "composer:" + tab + ":" + date;setComposer(latestDrafts.containsKey(slot)?latestDrafts.get(slot):runtime.repository.draft(slot)); }
    private void persistPosition() {
        if (runtime == null || composer == null) return;
        String target = slot, value = composer.getText().toString(), currentTab = tab, currentDate = date, y = String.valueOf(scroll.getScrollY());
        if(!saving){latestDrafts.put(target,value);runtime.queueDraft(target,value,()->error("草稿尚未保存，请保留当前输入"));}
        runtime.local.execute(() -> { try { runtime.repository.setUiState("tab", currentTab); runtime.repository.setUiState("date", currentDate); runtime.repository.setUiState("scroll:" + currentTab, y); } catch (Exception failure) { error("位置尚未保存"); } });
    }
    private void changeTab(String value) {
        if (saving || runtime == null) return;
        persistPosition(); tab = value; restoreComposer(); render();
        int position = 0; try { position = Integer.parseInt(runtime.repository.uiState("scroll:" + tab, "0")); } catch (NumberFormatException ignored) {}
        final int y = position; scroll.post(() -> scroll.scrollTo(0, y));
    }
    private void chooseDate() {
        if (saving || runtime == null) return;
        LocalDate current = LocalDate.parse(date);
        new DatePickerDialog(this, (picker, year, month, day) -> { persistPosition(); date = LocalDate.of(year, month + 1, day).toString(); restoreComposer(); render(); scroll.scrollTo(0, 0); }, current.getYear(), current.getMonthValue()-1, current.getDayOfMonth()).show();
    }

    private JSONObject content(String key, Object value) throws Exception { return new JSONObject().put(key, value); }
    private interface Work { void run() throws Exception; }
    private void local(Work action) {
        runtime.local.execute(() -> {
            try { action.run(); main.post(() -> { if (alive) { render(); runtime.requestSync(); } }); }
            catch (Exception failure) { error("未完成保存：" + safeMessage(failure)); }
        });
    }
    private static String safeMessage(Exception failure) {
        String message = failure.getMessage();
        return message == null || message.length() > 200 ? "本机内容保留，请重试" : message;
    }
    private void error(String value) { main.post(() -> { if (alive) Toast.makeText(this, value, Toast.LENGTH_LONG).show(); }); }

    private void saveComposer() {
        if(runtime==null)return;
        String value = composer.getText().toString();
        if (value.trim().isEmpty() || saving) return;
        if (value.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 65536) { error("内容超过 64 KiB，请拆分保存"); return; }
        if ("todo".equals(tab) && value.trim().length() > 500) { error("待办最多 500 个字符"); return; }
        final String targetTab = tab, targetDate = date, targetSlot = slot;
        saving = true; save.setEnabled(false); composer.setEnabled(false);
        runtime.local.execute(() -> {
            try {
                JSONObject body = new JSONObject();
                String source;
                if ("todo".equals(targetTab)) { source = "todo"; body.put("text", value.trim()).put("completed", false); }
                else if ("memo".equals(targetTab)) {
                    source = "memo_note"; body.put("title", titleFor(value)).put("body", value).put("position", 0).put("group_id", activeMemoGroup());
                } else { source = "note_entry"; body.put("text", value); }
                runtime.repository.createFromDraft(source, "life".equals(targetTab) ? "life" : "work".equals(targetTab) ? "work" : "", "memo".equals(targetTab) ? null : targetDate, body, targetSlot);
                main.post(() -> { if (alive) { latestDrafts.put(targetSlot,"");setComposer(""); error("已存本机"); render(); runtime.requestSync(); } });
            } catch (Exception failure) { error("未完成保存：" + safeMessage(failure)); }
            finally { main.post(() -> { saving = false; if (alive) { save.setEnabled(true); composer.setEnabled(true); } }); }
        });
    }
    private static String titleFor(String value) {
        String title = value.trim().split("\\R", 2)[0];
        int count = title.codePointCount(0, title.length());
        return count > 120 ? title.substring(0, title.offsetByCodePoints(0, 120)) : title;
    }
    private String activeMemoGroup() throws Exception {
        JSONObject entities = runtime.repository.snapshot().getJSONObject("entities");
        JSONObject selected=entities.optJSONObject("memo-group:"+selectedGroup);
        if(selected!=null&&!deleted(selected.getJSONObject("local")))return selectedGroup;
        List<JSONObject> groups=new ArrayList<>();
        for (Iterator<String> iterator = entities.keys(); iterator.hasNext();) {
            JSONObject row = entities.getJSONObject(iterator.next()).getJSONObject("local");
            if ("memo_group".equals(row.optString("source")) && !deleted(row))groups.add(row);
        }
        groups.sort(Comparator.comparingInt((JSONObject row)->row.optInt("position")).thenComparing(row->row.optString("source_id")));
        if(!groups.isEmpty())return groups.get(0).getString("source_id");
        String key = runtime.repository.create("memo_group", "", null, new JSONObject().put("title", "我的备忘录").put("position", 0));
        return key.substring(key.indexOf(':') + 1);
    }
    private void chooseMemoGroup(){
        if(runtime==null||saving)return;JSONObject entities=runtime.repository.snapshot().optJSONObject("entities");List<JSONObject> groups=new ArrayList<>();
        for(Iterator<String> iterator=entities.keys();iterator.hasNext();){JSONObject row=entities.optJSONObject(iterator.next()).optJSONObject("local");if(row!=null&&"memo_group".equals(row.optString("source"))&&!deleted(row))groups.add(row);}
        groups.sort(Comparator.comparingInt((JSONObject row)->row.optInt("position")).thenComparing(row->row.optString("source_id")));
        if(groups.isEmpty()){error("保存第一条备忘录时会创建“我的备忘录”分类");return;}
        String[] names=new String[groups.size()];for(int i=0;i<names.length;i++)names[i]=groups.get(i).optString("title");
        new AlertDialog.Builder(this).setTitle("新备忘录保存到").setItems(names,(dialog,index)->{selectedGroup=groups.get(index).optString("source_id");local(()->runtime.repository.setUiState("memo_group",selectedGroup));}).show();
    }

    private static boolean deleted(JSONObject row) { return !row.isNull("deleted_at") && !row.optString("deleted_at").isEmpty() || row.optBoolean("remote_missing", false); }
    private void render() {
        if (!alive || runtime == null || rows == null) return;
        int generation=++renderGeneration;
        runtime.local.execute(()->{JSONObject state=runtime.repository.snapshot();main.post(()->{if(alive&&generation==renderGeneration)renderState(state);});});
    }
    private void renderState(JSONObject state){
        JSONObject sync = state.optJSONObject("status");
        JSONArray operations = state.optJSONArray("operations");
        int pending = operations == null ? 0 : operations.length();
        String label = sync == null ? "" : sync.optString("message");
        status.setText((state.optString("account_id").isEmpty() ? "未关联账号 · 本机草稿" : "本机资料")
                + (pending == 0 ? "" : " · 待同步 " + pending + " 项") + (label.isEmpty() ? "" : "\n" + label));
        for (int i=0; i<tabs.getChildCount(); i++) {
            Button item = (Button) tabs.getChildAt(i); boolean active = tab.equals(item.getTag()); item.setTextColor(active ? ACCENT : MUTED); item.setTypeface(null, active ? Typeface.BOLD : Typeface.NORMAL);
        }
        boolean editable = !"reminder".equals(tab) && !"article".equals(tab);
        composer.setVisibility(editable ? View.VISIBLE : View.GONE); save.setVisibility(editable ? View.VISIBLE : View.GONE);
        composer.setHint("todo".equals(tab) ? "记一件要做的事…" : "memo".equals(tab) ? "写一条长期备忘…" : "此刻想记下什么？");
        heading.setText("todo".equals(tab) ? "今天要做的事" : "memo".equals(tab) ? "长期备忘录" : "life".equals(tab) ? "生活碎碎念" : "work".equals(tab) ? "工作碎碎念" : "reminder".equals(tab) ? "已获取的每日提醒" : "已获取的图文记录");
        dateButton.setText(date); dateButton.setVisibility("memo".equals(tab) || "article".equals(tab) ? View.GONE : View.VISIBLE);
        memoGroupButton.setVisibility("memo".equals(tab)?View.VISIBLE:View.GONE);
        JSONObject allEntities=state.optJSONObject("entities");JSONObject group=allEntities==null?null:allEntities.optJSONObject("memo-group:"+selectedGroup);
        memoGroupButton.setText("新建到："+(group==null?"默认分类":group.optJSONObject("local").optString("title","默认分类")));
        int y = scroll.getScrollY(); rows.removeAllViews();
        List<JSONObject> visible = new ArrayList<>(); JSONObject entities = state.optJSONObject("entities");
        if (entities != null) for (Iterator<String> iterator = entities.keys(); iterator.hasNext();) {
            JSONObject entry = entities.optJSONObject(iterator.next()), row = entry == null ? null : entry.optJSONObject("local");
            if (row == null || deleted(row)) continue;
            String source = row.optString("source"), category = row.optString("category");
            boolean match = "todo".equals(tab) && "todo".equals(source) || "memo".equals(tab) && "memo_note".equals(source)
                    || ("life".equals(tab) || "work".equals(tab)) && ("note_entry".equals(source) || "legacy_daily_note".equals(source)) && tab.equals(category)
                    || "reminder".equals(tab) && "work_reminder".equals(source) || "article".equals(tab) && "article".equals(source);
            if (match && ("memo".equals(tab) || "article".equals(tab) || date.equals(row.optString("date")))) visible.add(row);
        }
        visible.sort(Comparator.comparing((JSONObject row) -> row.optString("created_at")).thenComparing(row -> row.optString("entity_id")));
        if ("article".equals(tab)) visible.sort(Comparator.comparing((JSONObject row) -> row.optString("published_at", row.optString("updated_at"))).reversed());
        for (JSONObject row : visible) addRow(row, state);
        if (visible.isEmpty()) {
            empty = text(editable ? "本机还没有这类记录。可以直接在下面输入，保存后即使重启也会保留。" : "本机尚未获取这类数据。联网同步前不会显示虚构内容。", 15, MUTED);
            empty.setPadding(dp(8), dp(30), dp(8), dp(20)); rows.addView(empty);
        }
        if (!editable) { TextView note = text("article".equals(tab) ? "离线副本只含已获取的记录字段，不含未取得的原文和图片。内容可能已在网站更新或删除；联网后重新获取。" : "这是已获取的日期摘要，不是系统定时通知。未缓存的日期不会被推算。", 12, MUTED); note.setPadding(dp(6),dp(20),dp(6),dp(8)); rows.addView(note); }
        scroll.post(() -> { if (alive) scroll.scrollTo(0,y); });
    }

    private void addRow(JSONObject row, JSONObject state) {
        String key = row.optString("entity_id"), source = row.optString("source");
        LinearLayout card = new LinearLayout(this); card.setGravity(Gravity.CENTER_VERTICAL); card.setPadding(dp(4), dp(9), dp(8), dp(9));
        if ("todo".equals(source)) {
            boolean complete = row.optBoolean("completed", row.optInt("completed") == 1);
            Button circle = button(complete ? "✓" : ""); circle.setTextColor(complete ? Color.WHITE : ACCENT); circle.setMinWidth(0); circle.setMinimumWidth(0); circle.setPadding(0,0,0,0);
            GradientDrawable ring = new GradientDrawable(); ring.setShape(GradientDrawable.OVAL); ring.setColor(complete ? ACCENT : Color.TRANSPARENT); ring.setStroke(dp(2),ACCENT);
            circle.setBackground(new RippleDrawable(ColorStateList.valueOf(0x22406752), ring, null));
            circle.setContentDescription((complete ? "标记未完成：" : "标记完成：") + row.optString("text"));
            LinearLayout.LayoutParams mark = new LinearLayout.LayoutParams(dp(32),dp(32)); mark.setMargins(0,0,dp(12),0); card.addView(circle,mark);
            circle.setOnClickListener(v -> local(() -> runtime.repository.setComplete(key, !complete)));
        }
        LinearLayout body = new LinearLayout(this); body.setOrientation(LinearLayout.VERTICAL);
        String value = row.optString("text", row.optString("body", row.optString("summary", row.optString("title"))));
        if ("memo_note".equals(source) || "article".equals(source)) { TextView name = text(row.optString("title"),16,INK); name.setTypeface(null,Typeface.BOLD); body.addView(name); }
        TextView valueView = text(value.length()>320 ? value.substring(0,320)+"…" : value,16,INK);
        if ("todo".equals(source) && row.optBoolean("completed",row.optInt("completed")==1)) { valueView.setTextColor(MUTED); valueView.setPaintFlags(valueView.getPaintFlags() | Paint.STRIKE_THRU_TEXT_FLAG); }
        body.addView(valueView);
        JSONObject entry = state.optJSONObject("entities").optJSONObject(key);
        String detail = entry != null && entry.optBoolean("dirty") ? "已存本机 · 待同步" : "legacy_daily_note".equals(source) ? "旧版日记 · 保持独立记录" : "已获取的线上记录";
        body.addView(text(detail,11,MUTED)); card.addView(body,new LinearLayout.LayoutParams(0,-2,1));
        card.setOnClickListener(v -> { if ("todo".equals(source)) rowActions(row); else if ("work_reminder".equals(source) || "article".equals(source)) showReadOnly(row); else editRecord(row); });
        card.setOnLongClickListener(v -> { rowActions(row); return true; }); rows.addView(card);
        View line = new View(this); line.setBackgroundColor(Color.rgb(223,226,216)); rows.addView(line,new LinearLayout.LayoutParams(-1,dp(1)));
    }

    private void rowActions(JSONObject row) {
        String source = row.optString("source"), key = row.optString("entity_id");
        boolean readonly = "article".equals(source) || "work_reminder".equals(source);
        String[] options = readonly ? new String[]{"查看已获取内容","复制内容"} : "todo".equals(source) ? new String[]{"复制为新待办","复制内容","删除"} : new String[]{"编辑","复制内容","删除"};
        new AlertDialog.Builder(this).setTitle("记录操作").setItems(options,(dialog,index)-> {
            if (index==1) copy(row.optString("text",row.optString("body",row.optString("summary",row.optString("title")))));
            else if (index==0) { if (readonly) showReadOnly(row); else if ("todo".equals(source)) { changeTab("todo");setComposer(row.optString("text"));latestDrafts.put(slot,row.optString("text"));runtime.queueDraft(slot,row.optString("text"),()->error("复制的草稿尚未保存"));composer.requestFocus(); } else editRecord(row); }
            else new AlertDialog.Builder(this).setTitle("删除这条记录？").setMessage("删除先保存在本机，联网后按原版本同步；若线上已经变更，会保留冲突副本。").setPositiveButton("删除",(confirm,which)->local(()->runtime.repository.remove(key))).setNegativeButton("取消",null).show();
        }).show();
    }

    private void editRecord(JSONObject row) {
        String key = row.optString("entity_id"), source = row.optString("source"), draftKey = "edit:"+key;
        boolean memo = "memo_note".equals(source);
        LinearLayout fields = new LinearLayout(this); fields.setOrientation(LinearLayout.VERTICAL); fields.setPadding(dp(20),dp(6),dp(20),0);
        EditText title = new EditText(this); title.setSingleLine(true); title.setHint("标题"); title.setText(row.optString("title")); if(memo) fields.addView(title);
        EditText editor = new EditText(this); editor.setMinLines(7); editor.setMaxLines(14); editor.setGravity(Gravity.TOP); editor.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        boolean hasDraft=latestDrafts.containsKey(draftKey)||runtime.repository.containsDraft(draftKey);
        String stored = latestDrafts.containsKey(draftKey)?latestDrafts.get(draftKey):runtime.repository.draft(draftKey);editor.setText(hasDraft?stored:row.optString(memo?"body":"text")); fields.addView(editor);
        editor.addTextChangedListener(new TextWatcher(){
            @Override public void beforeTextChanged(CharSequence s,int start,int count,int after){}
            @Override public void onTextChanged(CharSequence s,int start,int before,int count){String value=s.toString();latestDrafts.put(draftKey,value);runtime.queueDraft(draftKey,value,()->error("编辑草稿尚未成功落盘"));}
            @Override public void afterTextChanged(Editable editable){}
        });
        if(memo){
            String titleSlot="edit-title:"+key;boolean hasTitleDraft=latestDrafts.containsKey(titleSlot)||runtime.repository.containsDraft(titleSlot);String titleDraft=latestDrafts.containsKey(titleSlot)?latestDrafts.get(titleSlot):runtime.repository.draft(titleSlot);if(hasTitleDraft)title.setText(titleDraft);
            title.addTextChangedListener(new TextWatcher(){
                @Override public void beforeTextChanged(CharSequence s,int start,int count,int after){}
                @Override public void onTextChanged(CharSequence s,int start,int before,int count){String value=s.toString();latestDrafts.put("edit-title:"+key,value);runtime.queueDraft("edit-title:"+key,value,()->error("标题草稿尚未成功落盘"));}
                @Override public void afterTextChanged(Editable editable){}
            });
        }
        AlertDialog dialog = new AlertDialog.Builder(this).setTitle(memo?"编辑备忘录":"编辑碎碎念").setView(fields).setPositiveButton("存本机",null).setNegativeButton("保留草稿",null).create();
        dialog.setOnShowListener(ignored->dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{
            String value=editor.getText().toString(),name=title.getText().toString();
            if(value.getBytes(java.nio.charset.StandardCharsets.UTF_8).length>65536||memo&&(name.trim().isEmpty()||name.codePointCount(0,name.length())>120)){error("请核对标题与 64 KiB 正文上限");return;}
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(false);dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setEnabled(false);dialog.setCancelable(false);editor.setEnabled(false);title.setEnabled(false);
            runtime.local.execute(()->{try{JSONObject changes=new JSONObject().put(memo?"body":"text",value);if(memo)changes.put("title",name.trim());runtime.repository.editFromDraft(key,changes,draftKey,memo?"edit-title:"+key:null);main.post(()->{latestDrafts.remove(draftKey);if(memo)latestDrafts.remove("edit-title:"+key);if(alive){dialog.dismiss();render();runtime.requestSync();}});}catch(Exception failure){main.post(()->{if(alive){dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(true);dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setEnabled(true);dialog.setCancelable(true);editor.setEnabled(true);title.setEnabled(true);error("尚未存盘，请保留输入或复制后重试："+safeMessage(failure));}});}});
        }));dialog.show();
    }

    private void showReadOnly(JSONObject row) {
        String value = "article".equals(row.optString("source")) ? row.optString("title")+"\n\n"+row.optString("summary")+"\n\n"+row.optString("notes")+"\n\n"+row.optString("url") : row.optString("summary");
        TextView body = text(value,16,INK); body.setTextIsSelectable(true); body.setPadding(dp(20),dp(14),dp(20),dp(14)); ScrollView scroller=new ScrollView(this);scroller.addView(body);
        new AlertDialog.Builder(this).setTitle("已获取的离线副本").setView(scroller).setPositiveButton("知道了",null).setNeutralButton("复制",(dialog,which)->copy(value)).show();
    }
    private void copy(String value) { ClipboardManager clipboard=(ClipboardManager)getSystemService(CLIPBOARD_SERVICE);if(clipboard!=null)clipboard.setPrimaryClip(ClipData.newPlainText("好多鱼",value));error("已复制"); }

    private void showMenu(View anchor) {
        if(runtime==null){error("正在读取本机资料，请保留当前输入");return;}
        PopupMenu menu=new PopupMenu(this,anchor);
        String[] names={"立即同步","登录 / 重新登录","冲突与保留副本","网页版与低频功能","关于离线版","本机草稿"};
        for(int i=0;i<names.length;i++)menu.getMenu().add(0,i, i,names[i]);
        menu.setOnMenuItemClickListener(item->{switch(item.getItemId()){
            case 0:runtime.requestSync();error("已请求同步；没有网络时仍可继续记录");break;
            case 1:login();break;
            case 2:showConflicts();break;
            case 3:persistPosition();startActivity(new Intent(this,MainActivity.class));break;
            case 4:new AlertDialog.Builder(this).setTitle("好多鱼离线版").setMessage("版本 "+BuildConfig.VERSION_NAME+"\n待办、备忘录、生活和工作碎碎念先存本机，再与 haoduoyu.xyz 原数据同步。\n图文记录与每日提醒仅显示实际获取的副本。\nAndroid 可能延迟后台任务；强制停止后须重新打开应用才能继续同步。没有新增系统定时通知。\n卸载或清除数据会删除本机未同步内容。"+(BuildConfig.DEBUG?"\n当前为调试预览，不能当作正式发布签名版。":"")).setPositiveButton("知道了",null).show();break;
            case 5:showDrafts();break;
            default:break;
        }return true;});menu.show();
    }
    private void showSyncDetails() { if(runtime==null)return;new AlertDialog.Builder(this).setTitle("本机与同步状态").setMessage(status.getText()+"\n\n未发送操作和冲突副本会保留到重启后。同步只使用原账号与原接口；登录失效或权限变化时暂停，不切换身份重放。").setPositiveButton("请求同步",(dialog,which)->runtime.requestSync()).setNegativeButton("关闭",null).show(); }

    private void login() {
        LinearLayout fields=new LinearLayout(this);fields.setOrientation(LinearLayout.VERTICAL);fields.setPadding(dp(20),0,dp(20),0);
        EditText username=new EditText(this);username.setSingleLine(true);username.setHint("原网站账号");fields.addView(username);
        EditText password=new EditText(this);password.setSingleLine(true);password.setHint("密码（不会保存）");password.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD);fields.addView(password);
        AlertDialog dialog=new AlertDialog.Builder(this).setTitle("使用原网站账号").setView(fields).setPositiveButton("登录",null).setNegativeButton("取消",null).create();
        dialog.setOnShowListener(ignored->dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{
            String user=username.getText().toString(),pass=password.getText().toString();if(user.isEmpty()||pass.isEmpty())return;
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(false);
            // Authentication has its own executor so UI database edits remain responsive.
            startupAndLogin.execute(()->{
                try{
                    runtime.api.request("POST","/api/v1/auth/login",new JSONObject().put("username",user).put("password",pass));
                    JSONObject identity=runtime.api.me();String id=identity.getString("id"),name=identity.optString("username",user);
                    main.post(()->{password.setText("");dialog.dismiss();if(!alive)return;
                        String bound=runtime.repository.snapshot().optString("account_id");
                        if(!bound.isEmpty()&&!bound.equals(id)){error("本机离线库属于另一账号。内容仍保留，请登录原账号后同步。");return;}
                        if(bound.isEmpty())new AlertDialog.Builder(this).setTitle("关联本机记录").setMessage("将本机离线记录关联到账号「"+name+"」并与该网站账号同步？后续不会自动换账号发送。").setPositiveButton("关联并同步",(confirm,which)->local(()->runtime.repository.bindAccount(id))).setNegativeButton("暂不关联",null).show();
                        else{runtime.requestSync();render();}
                    });
                }catch(Exception failure){main.post(()->{password.setText("");if(alive){dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(true);error("登录未完成，请核对账号、网络和网站权限。");}});}
            });
        }));dialog.show();
    }

    private void showConflicts() {
        JSONObject state=runtime.repository.snapshot();JSONArray operations=state.optJSONArray("operations"),archive=state.optJSONArray("conflicts");
        List<JSONObject> active=new ArrayList<>();if(operations!=null)for(int i=0;i<operations.length();i++){JSONObject op=operations.optJSONObject(i);if(op!=null&&"conflict".equals(op.optString("status")))active.add(op);}
        if(!active.isEmpty()){
            JSONObject op=active.get(0);String id=op.optString("op_id"),key=op.optString("entity_id");JSONObject entry=state.optJSONObject("entities").optJSONObject(key);JSONObject payload=entry==null?op.optJSONObject("payload"):entry.optJSONObject("local");String local=payload==null?"":payload.optString("text",payload.optString("body",payload.optString("title")));
            JSONObject conflict=null;if(archive!=null)for(int i=0;i<archive.length();i++){JSONObject candidate=archive.optJSONObject(i);if(candidate!=null&&key.equals(candidate.optString("entity_id"))&&!candidate.optBoolean("resolved")){conflict=candidate;break;}}
            JSONObject remote=conflict==null?null:conflict.optJSONObject("remote");String server=remote==null?"当前无法确认，原文已保留":deleted(remote)?"线上已删除":remote.optString("text",remote.optString("body",remote.optString("title")));
            String reason=conflict==null?"版本已变化":conflict.optString("reason","版本已变化");
            TextView comparison=text(reason+"\n\n本机最新内容：\n"+local+"\n\n线上内容：\n"+server+"\n\n不会自动覆盖线上版本。被替换的本机操作和内容仍留在保留副本中。",15,INK);comparison.setPadding(dp(20),dp(12),dp(20),dp(12));comparison.setTextIsSelectable(true);ScrollView holder=new ScrollView(this);holder.addView(comparison);
            new AlertDialog.Builder(this).setTitle("冲突：保留双方内容").setView(holder).setPositiveButton("另存新记录",(dialog,which)->local(()->runtime.repository.resolveWithCopy(id))).setNeutralButton("保留副本并采用线上",(dialog,which)->local(()->runtime.repository.resolveUsingServer(id))).setNegativeButton("暂不处理",null).show();return;
        }
        if(archive==null||archive.length()==0){error("没有待处理冲突或保留副本");return;}
        StringBuilder body=new StringBuilder();for(int i=0;i<archive.length();i++)body.append(archive.optJSONObject(i)).append("\n\n");
        TextView value=text(body.toString(),14,INK);value.setTextIsSelectable(true);value.setPadding(dp(20),dp(10),dp(20),dp(10));ScrollView scroller=new ScrollView(this);scroller.addView(value);
        new AlertDialog.Builder(this).setTitle("冲突保留副本").setView(scroller).setPositiveButton("关闭",null).setNeutralButton("复制全部",(dialog,which)->copy(body.toString())).show();
    }

    private void showDrafts(){
        JSONObject drafts=runtime.repository.snapshot().optJSONObject("drafts");List<String> keys=new ArrayList<>();
        if(drafts!=null)for(Iterator<String> iterator=drafts.keys();iterator.hasNext();){String key=iterator.next();if(!drafts.optString(key).isEmpty())keys.add(key);}
        if(keys.isEmpty()){error("没有额外草稿");return;}
        String[] labels=new String[keys.size()];for(int i=0;i<keys.size();i++){String value=drafts.optString(keys.get(i));labels[i]=value.length()>60?value.substring(0,60)+"…":value;}
        new AlertDialog.Builder(this).setTitle("本机草稿").setItems(labels,(dialog,index)->{String value=drafts.optString(keys.get(index));TextView view=text(value,16,INK);view.setTextIsSelectable(true);view.setPadding(dp(20),dp(12),dp(20),dp(12));ScrollView holder=new ScrollView(this);holder.addView(view);new AlertDialog.Builder(this).setTitle("草稿原文").setView(holder).setPositiveButton("复制",(selected,which)->copy(value)).setNegativeButton("关闭",null).show();}).show();
    }

    private void handleBack() {
        if(composer==null){moveTaskToBack(true);return;}
        View focus=getCurrentFocus();InputMethodManager input=(InputMethodManager)getSystemService(INPUT_METHOD_SERVICE);
        if(focus!=null&&input!=null&&input.isActive(focus)){focus.clearFocus();input.hideSoftInputFromWindow(focus.getWindowToken(),0);persistPosition();return;}
        persistPosition();if(!"todo".equals(tab)){changeTab("todo");return;}
        long now=android.os.SystemClock.elapsedRealtime();if(now-lastBack<2200){moveTaskToBack(true);lastBack=0;}else{lastBack=now;error("再按返回收起好多鱼；本机内容会保留");}
    }
    @SuppressWarnings("deprecation") @Override public void onBackPressed(){handleBack();}
    @Override protected void onResume(){super.onResume();alive=true;if(runtime!=null){runtime.listen(refresh);render();runtime.requestSync();}}
    @Override protected void onPause(){persistPosition();if(runtime!=null)runtime.unlisten(refresh);super.onPause();}
    @Override protected void onSaveInstanceState(Bundle out){if(composer!=null){out.putString("tab",tab);out.putString("date",date);if(!saving)out.putString("draft",composer.getText().toString());out.putInt("scroll",scroll.getScrollY());}super.onSaveInstanceState(out);}
    @Override protected void onDestroy(){alive=false;main.removeCallbacksAndMessages(null);startupAndLogin.shutdownNow();if(runtime!=null)runtime.unlisten(refresh);if(Build.VERSION.SDK_INT>=33&&backCallback!=null)getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backCallback);super.onDestroy();}
}
