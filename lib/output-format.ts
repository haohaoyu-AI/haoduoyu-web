// Typography comes from the owner's 2026-10-05 Word template OOXML; Heading1 for subheadings is the user's explicit override.
export const outputFormat={
 version:'好多鱼Word模板-20261005',
 deliverable:'真实DOCX文件；模型文字返回后由文档制作步骤生成，不能把文字或虚构链接当作Word',
 page:{size:'A4',margins_inches:{top:1,bottom:1,left:1,right:1}},
 fonts:{eastAsia:'Source Han Serif SC',latin:'Times New Roman'},
 title:{size_pt:20,bold:true,color:'0F4761',style:'Heading1'},
 body:{size_pt:12,bold:false,color:'000000'},
 subheading:{size_pt:12,bold:true,color:'000000',style:'Heading1',paragraph:'独立段落（每个小标题各占一个Word段落）',ooxml:'w:pStyle=Heading1',numbering:'模板为文字01至06；已保存正文的原编号保持不变'},
 paragraph:{line_spacing_multiple:1.15,space_after_pt:10,first_line_indent:0},
 verification:'实际生成DOCX后核对完整正文、顺序和图片，再逐页渲染检查；每个编号小标题必须独立成段，并在OOXML中实际设置w:pStyle=Heading1。保留原字体声明；若预览环境缺字体，明确说明预览替代，不能声称像素级一致。'
} as const;
