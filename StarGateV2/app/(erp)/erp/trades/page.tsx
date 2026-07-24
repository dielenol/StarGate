import PageHead from "@/components/ui/PageHead/PageHead";

import TradesClient from "./TradesClient";

export default function TradesPage() {
  return (
    <>
      <PageHead
        breadcrumb={[
          { label: "ERP", href: "/erp" },
          { label: "교환·전달" },
        ]}
        title="교환·전달"
      />
      <TradesClient />
    </>
  );
}
