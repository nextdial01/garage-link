export type LineRole = 'owner' | 'admin' | 'staff' | 'viewer';

export type LineTenantContext = {
  tenantId: string | null;
  storeId?: string | null;
  lineAccountId?: string | null;
  features: string[];
  role: LineRole;
};

export type LineAccountContext = {
  lineAccountId?: string | null;
  channelId?: string | null;
  basicId?: string | null;
  webhookUrl?: string | null;
};

export type LineRecipient = {
  lineFriendId: string;
  lineUserId?: string;
  lineUserHash?: string;
  displayName?: string | null;
  tenantId: string | null;
  storeId?: string | null;
  tags?: string[];
};

export type LineSegmentCondition =
  | {
      type: 'single_draft';
      draftId: string;
      customerId?: string | null;
      lineUserId?: string | null;
    }
  | {
      type: 'tag';
      tagNames: string[];
    }
  | {
      type: 'manual_segment';
      segmentId: string;
    }
  | {
      type: 'form_answer';
      formId: string;
      questionKey?: string;
      value?: string;
    };

export type LineDeliveryRequest = {
  tenant: LineTenantContext;
  condition: LineSegmentCondition;
  message: {
    type: 'text';
    title?: string | null;
    body: string;
  };
  deliveryType: 'test' | 'confirm' | 'send' | 'scheduled';
};

export type LineDeliveryResult = {
  ok: boolean;
  targetCount: number;
  sentCount?: number;
  failedCount?: number;
  skippedCount?: number;
  errorCode?: string;
};

export type LineFeatureFlags = {
  line: boolean;
  campaigns?: boolean;
  scenarios?: boolean;
  forms?: boolean;
  richMenus?: boolean;
  customerLink?: boolean;
  garageLink?: boolean;
};
