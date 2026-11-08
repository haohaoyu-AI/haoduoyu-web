# Windows第十九阶段：原生每用户安装器源码候选

基线为0.18.0产品1bbab1ba960c12f9622658e168791f6de1cae320，其正常Windows CI42415709343成功。本轮版本0.19.0，只扩展桌面安装交付路径和独立Windows CI；网站、后端、数据库、Android及用户电脑均未改动。

## 交付路径

原便携ZIP继续保留。Windows CI在便携构建成功后，用精确源的自包含win-x64载荷、官方NuGet固定WiX4.0.6和runner现有官方Visual Studio/Windows SDK构建未签名每用户MSI。新脚本要求已提交精确源码，完整核对逐文件manifest/哈希，不接受链接、大小写冲突、缺漏或夹带数据目录；状态、哈希与失败信息进入独立交付manifest。标准ICE不关闭；即使MSI步骤失败仍保留已有便携包与证据。

程序固定安装到%LOCALAPPDATA%\Programs\Haoduoyu\NativeWorkbench，私有数据仍独立在%LOCALAPPDATA%\Haoduoyu\NativeWorkbench\v1，MSI不接管、迁移或删除数据。只登记开始菜单和应用列表，不提权、不启动应用、不联网引导或后台更新，不自动关闭编辑器或重启。维护前须用户自行关闭客户端。三段数字版本、固定UpgradeCode及精确源决定ProductCode；同一MSI维护、升级事务及降级/同版本异源拒绝路径待Windows实跑。

## 实际MSI防护，不仅是测试脚本

初审发现“测试脚本拒绝既有目录，但真实MSI直接写固定目录”的接管风险，已在实际产品中加入原生只读安全门：独立核对当前用户非托管MSI登记、同族UpgradeCode与真实安装位置；首次既有程序或开始菜单目录一律拒绝接管。逐级用OPEN_REPARSE_POINT和最终路径检查现有路径，遍历既有程序/菜单子项拒绝重解析点、硬链接和无法核验对象；在RemoveShortcuts及InstallFiles前再次以当前用户身份检查。它不修改原文件、不删除便携目录，不以可伪造的公开MSI属性充当所有权。复审未发现新的确定源码阻断。

这些门禁仍有检查到使用的竞态边界，不能承诺抵御任意恶意并发目录替换；重定向AppData、短路径别名可能保守拒绝，兼容性待实测。代码级修正不等于Windows DLL已编译或实际MSI已通过防护检查。

## 合成Windows验收计划与准确边界

验收脚本强制仅在GitHub托管临时Windows runner运行，禁止用户设备；预存程序、菜单、注册及运行进程均拒绝。计划运行真实MSI安装、取消回调1602、旧版本夹具升级、同包维护、降级/同版本异源1603拒绝和卸载；核对全安装清单、哈希以及临时私有数据和非owned额外文件保留，并覆盖首次便携目录、各层junction/硬链接及卸载目录被junction替换时保全外部文件。

旧版及同版本夹具复用完全相同的候选payload，只改变MSI元数据，不能代表真实旧客户端、数据迁移或不同载荷兼容验收。跨版本新增文件名与非owned文件冲突、升级途中取消、锁文件、完整交互及重定向AppData未覆盖。未签名，信任、实体设备及生产账号另行验收。

## 已完成与未完成

Linux本机Node安装器检查28/28、0跳过；官方PowerShell7.5.4解析三个脚本零错误，实际单反斜杠/嵌套路径回归通过；C#取消夹具仅编译、未调用WindowsAPI，XML仅良构检查。完整Windows.Tests Release交叉编译28.39秒，0警告、0错误。隔离检查及diff --check通过。

WiX4.0.6从官方NuGet私有恢复并核对CLI版本；Linux不是受支持的MSI构建环境，未据其尝试结果宣称成功。发布前本机未运行原生C++ DLL、WiX/ICE、MSI生成及合成安装。随后的精确源云端运行及失败终态见下；不得称为可下载安装包或已完成安装验收。现有日志及产物访问限制保持，不换路线下载或读取；未安装用户电脑、签名、发布Release或部署网站。

## 精确源发布与首次Windows CI失败

用户明确同意上传此前列出的14个文件并在临时Windows测试。非force、expected-parent保存为299332a77e4d50e1c80ce5d1252eb3909078940d，fetch回读一致；整仓树7101262a043d63bfac6d00ea422b5f3c6b9446ca与本机受测cc3ad8d完整一致。

自动Windows CI42442449697、job128614349349于2026-11-08T03:27:45Z明确completed/failure。客户端合成测试和便携包步骤已success；进入新MSI步骤后运行结束，但两种只读步骤摘要仍返回MSI in_progress/无conclusion，不能据此定位C++、WiX/ICE、MSI生成或安装哪一层失败，也不能断言后续安装动作成功或未发生。已保留产物13602726007，元数据122,980,962字节、保留至2026-11-11T03:27:40Z，大小不证明内含已验收MSI。

未读取受限job日志、未下载产物、未重跑CI或猜改源码。下一步需获得本次失败日志的可用诊断结果后再修复与定向测试；旧产物及日志访问停止边界继续保持。用户设备没有安装或修改。

## 单次批准的失败日志诊断

用户随后明确只批准读取本次job128614349349的失败日志，不批准其他日志或下载包。正常日志接口本次成功读取；未请求其他日志或产物字节。

日志确认Windows原生合成检查65/65通过；恢复9/9和原子导出14/14均0跳过，安装器Node检查28/28。原生防护DLL编译、候选及两个夹具MSI构建命令均成功返回，构建脚本默认WiX/ICE验证未关闭。仍未独立检查MSI字节或具体ICE清单。

准确失败为test-installer-windows.ps1第132行：Read-MsiProperty读取ProductCode返回null后调用Trim，报“You cannot call a method on a null-valued expression.”。发生在首个安装调用前，因此不能报告安装、取消、升级、卸载或路径门禁已动态通过。现已对Record.StringData带索引COM属性读取作最小兼容修正，保留身份及scope校验，不给缺失ProductCode补默认值；修复版Windows验证待执行。

修复只改此前批准文件中的两个脚本：以显式GetProperty取StringData索引1，必需属性缺行、空值或非字符串立即失败；仅ALLUSERS允许缺失，真实1/2等值保留给原scope断言拒绝。Node新增静态约束及官方PowerShell实际回归：AST仅加载该函数，合成indexed-property对象覆盖正常身份、缺失/空/异常和关闭view路径，不运行COM、WindowsAPI或整个安装脚本。本机30/30通过、0失败、0跳过，三份PS解析0错误，隔离及diff检查通过。旧函数负对照会因接受缺失必需属性失败；这不等于在Linux重现Windows COM内部null派发。下一次精确源Windows CI仍需验证真实MSI路径。

## 修复版上传及第二次Windows CI终态

用户明确批准修复后的同5文件上传并重新运行临时Windows测试后，非force保存为022cde638a7213f4bf92245e54885efce26ea33e，fetch回读一致。整仓树a4362d7bc6ec8edc3ffacd9e1bfda1873c4c3e12与本机30项通过的12331d3完全相同。

自动CI42443996728、job128618986639于2026-11-08T03:51:33Z明确completed/failure；本次job摘要steps为null、独立步骤接口返回空数组，无法确认故障细分位置。不能假定仍是旧ProductCode问题，亦不宣称此次MSI构建或安装通过。产物13603131711只读元数据124,563,388字节、保留至2026-11-11T03:51:27Z，未下载。旧的单job日志许可不扩到新job，因此未读128618986639日志、未重复CI；需要本次具体错误后再定向处理。用户设备无操作，未改网站、生产或签名发布。

## 第二个job的单次批准日志诊断

用户明确批准读取job128618986639后，正常接口读取成功；未读其他job或下载产物。日志确认修复版身份及scope读取已越过、Node/PowerShell30项和Windows原生65项通过，DLL和三个MSI构建命令完成。实际安装QA继续经过既有程序/菜单目录、三处junction拒绝、机器范围拒绝及首次进度取消的断言，随后install-synthetic-older返回0，但测试仅查询HKCU卸载项的Is-Registered判断false，报“Older synthetic fixture is not registered for the current user.”。

直接证据不能证明是真实安装未登记、不同登记位置还是探针误判，尚未走到该夹具完整载荷核对。现优先将登记探针改为准确ProductCode的Windows Installer当前用户非托管上下文查询，区分不存在、已广告、已安装及API错误，避免凭一个ARP注册表位置猜测；不放松产品原生所有权/链接门禁及完整载荷/数据保全检查。修复及下一次Windows实跑待记。

登记探针现已在原CI夹具加入只读MsiGetProductInfoExW helper，严格规范化非空GUID，SID=null仅当前用户、context2仅USERUNMANAGED、只读State。仅1605返回不存在，状态1广告与5已安装分别处理，其余错误或异常值停止。广告不会通过安装成功断言，预检遇广告同样停止；清理本次初始不存在的准确测试product时同时处理广告/安装状态，每产品异常记录后仍检查另一产品。未改真正嵌入MSI的C++所有权门禁。

新增静态约束和官方PowerShell实际编译C#/提取脚本回归，注入合成查询、不调用WindowsAPI，验证GUID、SID/context/property、1605/1/5、错误拒绝及清理分支。本机32/32通过、0失败、0跳过；三个PS解析0错误，C#夹具仅编译、XML良构、源码隔离及diff检查通过。此结果不证明旧次安装的实际登记或修复版Windows API已通过，仍需下一次精确源临时Windows CI。
