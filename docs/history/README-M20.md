# M2.0 Caption Studio — test build

- 24 original visual preset previews; these are not purchased or copied MOGRT files and do not apply styling automatically.
- After generating SRT, **Import SRT to Premiere Project** uses documented `Project.importFiles` in Premiere UXP 25.6 and verifies result.
- This operation imports an item to the Project Panel. It does NOT automatically add a native Caption Track in Premiere 25.6.2. That method is documented in legacy ExtendScript, not established for UXP 25.6.2.
- Do not claim timeline insertion unless caption track count increased.
- Always back up project; test on duplicate.
