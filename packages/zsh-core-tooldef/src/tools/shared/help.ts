export const safetyDescription = "No shell execution, no environment access."

export const resolutionDescription = `\
Resolution turns input forms into canonical ids:
  AUTO_CD     -> option/autocd
  NO_AUTO_CD  -> option/autocd (feedback: input-negated)
  %1          -> job_spec/%number`
