// @vitest-environment node
import {expect,it} from 'vitest';
import {validateStagingStopNames} from '../../scripts/stop-staging-revisions.mjs';
it('accepts only bounded superseded staging names and deduplicates them',()=>{expect(validateStagingStopNames(['staging-previous-ready','staging-new-build'],'staging-new-ready')).toEqual(['staging-previous-ready','staging-new-build']);expect(validateStagingStopNames(['staging-old','staging-old'],'staging-new')).toEqual(['staging-old']);});
it('refuses production, current, malformed or unbounded stop targets',()=>{for(const names of [['production-old'],['staging-current'],['staging-../../other'],['staging-a','staging-b','staging-c'],null])expect(()=>validateStagingStopNames(names,'staging-current')).toThrow('unsafe');});
