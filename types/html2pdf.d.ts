declare module "html2pdf.js" {
  interface Html2PdfChain {
    set: (options: unknown) => Html2PdfChain;
    from: (element: HTMLElement) => Html2PdfChain;
    save: () => Promise<void>;
  }

  const html2pdf: () => Html2PdfChain;

  export default html2pdf;
}
