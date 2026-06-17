export type OrganizationFields = {
  companyName: string;
  storeName: string;
  contactName: string;
  phone: string;
  email: string;
  businessType: string;
  prefecture: string;
  address: string;
};

export type OrganizationState = {
  status: "idle" | "success" | "error";
  message: string;
  fields: OrganizationFields;
};
