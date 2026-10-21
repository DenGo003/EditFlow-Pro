# Online updates — GitHub Releases

The 0.9.6 panel defaults to `https://api.github.com/repos/DenGo003/EditFlow-Pro/releases/latest` and also considers a higher versioned Unified ZIP in Windows Downloads. The published `v0.8.2` legacy package is older and ignored.

A future Release must use tag `vX.Y.Z` and include `EditFlow-Pro-X.Y.Z-Unified.zip`. The GitHub asset API must expose a `sha256:` digest for that ZIP. The client verifies the ZIP against this digest, then checks the internal package manifest, every member hash, release version, and Premiere target `25.6.2`. It stages the package, waits for Premiere and the backend to close, installs program files, and keeps backup, Python runtime, user outputs, models, and pairing state. The hash is integrity checking, not an independent publisher signature.

`release.json` has `hostVerified: false` until Windows/Premiere 25.6.2 acceptance. The publishing workflow refuses production releases while it is false. Merge and manual dispatch alone cannot override that gate. Do not claim the online update has been exercised in a live Adobe host before the acceptance run.
