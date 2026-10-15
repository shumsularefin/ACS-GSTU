// What each editor role may do. The Firestore rules enforce the same boundaries on the server;
// this file only decides which tools the dashboard shows.
export const roleInfo = {
  'super-admin': {
    label: 'Super-admin',
    summary: 'Full access: website content, executive committees and rosters, all certificates, editor access and the activity log.',
  },
  administrator: {
    label: 'Chapter administrator',
    summary: 'Events, homepage images, membership information, and certificates except executive recognition.',
  },
  outreach: {
    label: 'Outreach editor',
    summary: 'Homepage images, membership information, adding events (and editing your own), and participant certificates.',
  },
};

export function permissions(role) {
  const superAdmin = role === 'super-admin';
  const editor = role in roleInfo;
  return {
    editor,
    superAdmin,
    events: editor,
    editAnyEvent: superAdmin || role === 'administrator',
    deleteEvents: superAdmin,
    homepage: editor,
    membership: editor,
    team: superAdmin,
    import: superAdmin,
    certificates: editor,
    certificateTypes: (type) => superAdmin || (role === 'administrator' && type !== 'executive') || type === 'participant',
    revoke: superAdmin,
    catalog: superAdmin,
    registry: superAdmin,
    editors: superAdmin,
    activity: superAdmin,
    backups: superAdmin,
    migrate: superAdmin,
  };
}

export const canEditEvent = (perms, entry, uid) => perms.editAnyEvent || !entry || entry.createdBy === uid;
