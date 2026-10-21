export const CASE_LIBRARY = Object.freeze({
  version: "1.0.0",
  cases: [
    {
      id: "acupoint-direction-missing",
      title: "穴位操作方向说明缺失",
      abstractPattern:
        "一份材料明确写出穴位按摩方向，另一份材料只提到穴位名称或按摩动作，没有说明起止方向。",
      risk: "mid",
      requiredFields: ["穴位或操作对象", "方向", "来源"],
      detection: "方向事实与穴位提及覆盖差集",
      suggestion: "补充箭头、起止点或真人演示，并在视频与课件中使用同一描述。",
    },
    {
      id: "acupoint-direction-conflict",
      title: "穴位操作方向相互矛盾",
      abstractPattern:
        "同课材料对同一穴位写出相反或不同的按摩方向，例如从上到下与从下到上。",
      risk: "high",
      requiredFields: ["穴位或操作对象", "方向A", "方向B", "来源"],
      detection: "同一穴位方向属性冲突",
      suggestion: "回到正式示教视频核验，无法确认时不要发布自动演示。",
    },
    {
      id: "external-reference-direction-uncertainty",
      title: "内部材料与外部科普存在方向差异",
      abstractPattern:
        "内部课件给出了外部公开科普未采用或描述不同的操作方向，来源真实性未经验证。",
      risk: "mid",
      requiredFields: ["内部方向", "外部来源", "适用条件"],
      detection: "外部来源标签与人工复核",
      suggestion: "不用网络视频替代课程标准；记录权威示教来源并由专业老师确认。",
    },
    {
      id: "quiz-answer-vs-lesson-conflict",
      title: "作业答案解析与视频知识点冲突",
      abstractPattern:
        "课后作业的题目答案或解析所描述的知识，与视频课程正文的判断标准相反或不一致。",
      risk: "high",
      requiredFields: ["题号", "选项或答案", "解析", "课程原文"],
      detection: "作业答案事实与课程知识事实交叉校验",
      suggestion: "逐题核对题目、选项、答案、解析和视频原文，确认后整版发布。",
    },
    {
      id: "recurring-quiz-version-error",
      title: "同类作业错误跨版本再次出现",
      abstractPattern:
        "同一门课的历史作业曾经出现答案或解析错误，新一期同类题目再次出现编辑偏误。",
      risk: "high",
      requiredFields: ["历史问题", "当前版本", "题号", "复核人"],
      detection: "历史错误标签 + 当前任务聚合",
      suggestion: "将题目、选项、答案和解析纳入发布前双人复核，并保留修订记录。",
    },
  ],
});
